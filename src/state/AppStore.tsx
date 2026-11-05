import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import * as db from '../db/database';
import { dayKey, msUntilNextMidnight } from '../domain/dates';
import { isDuplicateScan, isSameTag } from '../domain/tag';
import type { IntakeEntry, IntakeSource, Settings } from '../domain/types';
import { DEFAULT_SETTINGS, LIMITS } from '../domain/types';
import { cancelAllReminders, configureNotifications, syncReminders } from '../notifications/reminders';

export type TapResult =
  | { status: 'logged'; entry: IntakeEntry; totalMl: number; goalReachedNow: boolean }
  | { status: 'duplicate' }
  | { status: 'unknown-tag' }
  | { status: 'no-sticker' };

interface TodayState {
  day: string;
  totalMl: number;
  entries: IntakeEntry[];
}

interface AppStore {
  ready: boolean;
  error: string | null;
  settings: Settings;
  today: TodayState;
  /** Increments on every history change so screens can refetch. */
  revision: number;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  /**
   * Single entry point for sticker taps. In-app taps pass the tag UID; taps that
   * arrive through the sticker link (app closed / iOS Shortcut) pass `byLink`,
   * whose secret key the caller has already verified.
   */
  handleStickerTap: (uid: string | null, source: Exclude<IntakeSource, 'manual'>, byLink?: boolean) => Promise<TapResult>;
  logManual: (amountMl?: number) => Promise<IntakeEntry>;
  deleteEntry: (id: number) => Promise<void>;
  refreshToday: () => Promise<void>;
  resetApp: () => Promise<void>;
}

const Ctx = createContext<AppStore | null>(null);

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [today, setToday] = useState<TodayState>({ day: dayKey(), totalMl: 0, entries: [] });
  const [revision, setRevision] = useState(0);

  // Latest values for async callbacks (kept current by the setters below as well).
  const settingsRef = useRef(settings);
  const todayRef = useRef(today);
  useEffect(() => {
    settingsRef.current = settings;
    todayRef.current = today;
  }, [settings, today]);

  /** Serialises every write that depends on previous state (duplicate protection). */
  const lock = useRef<Promise<unknown>>(Promise.resolve());
  const withLock = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const run = lock.current.catch(() => undefined).then(fn);
    lock.current = run;
    return run;
  }, []);

  const loadToday = useCallback(async (): Promise<TodayState> => {
    const day = dayKey();
    const entries = await db.getEntriesForDay(day);
    const next = { day, entries, totalMl: entries.reduce((s, e) => s + e.amountMl, 0) };
    setToday(next);
    todayRef.current = next;
    return next;
  }, []);

  const refreshToday = useCallback(async () => {
    await loadToday();
  }, [loadToday]);

  // Initial load.
  useEffect(() => {
    let alive = true;
    configureNotifications();
    (async () => {
      try {
        const s = await db.loadSettings();
        if (!alive) return;
        setSettings(s);
        settingsRef.current = s;
        await loadToday();
      } catch (e) {
        setError(String((e as Error)?.message ?? e));
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [loadToday]);

  // Day rollover: refresh at midnight and whenever the app returns to the foreground.
  useEffect(() => {
    if (!ready) return;
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      timer = setTimeout(() => {
        loadToday().catch(() => undefined);
        arm();
      }, msUntilNextMidnight() + 1000);
    };
    arm();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        clearTimeout(timer);
        arm();
        // Drinks may have been logged while closed (Android sticker taps): refresh all.
        loadToday()
          .then(() => setRevision((r) => r + 1))
          .catch(() => undefined);
      }
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [ready, loadToday]);

  // Keep the reminder window in sync with progress and settings (debounced).
  const lastIntakeAt = today.entries[0]?.createdAt ?? null;
  useEffect(() => {
    if (!ready || !settings.onboarded) return;
    const t = setTimeout(() => {
      syncReminders({
        settings: settings.reminders,
        todayTotalMl: today.totalMl,
        goalMl: settings.goalMl,
        lastIntakeAt,
      }).catch(() => undefined);
    }, 400);
    return () => clearTimeout(t);
  }, [ready, settings.onboarded, settings.reminders, settings.goalMl, today.totalMl, today.day, lastIntakeAt]);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    await db.saveSettings(patch);
  }, []);

  const insert = useCallback(
    async (amountMl: number, source: IntakeSource, tagId: string | null) => {
      const s = settingsRef.current;
      const before = todayRef.current.day === dayKey() ? todayRef.current.totalMl : 0;
      const entry = await db.insertIntake({ amountMl, goalMl: s.goalMl, source, tagId });
      const next = await loadToday();
      setRevision((r) => r + 1);
      return { entry, totalMl: next.totalMl, goalReachedNow: before < s.goalMl && next.totalMl >= s.goalMl };
    },
    [loadToday],
  );

  const handleStickerTap = useCallback<AppStore['handleStickerTap']>(
    (uid, source, byLink = false) =>
      withLock(async (): Promise<TapResult> => {
        const s = settingsRef.current;
        if (!s.sticker) return { status: 'no-sticker' };
        if (!byLink && !isSameTag(uid, s.sticker.uid)) return { status: 'unknown-tag' };
        const last = await db.getLastScanAt();
        if (isDuplicateScan(last, Date.now(), LIMITS.scanCooldownMs)) return { status: 'duplicate' };
        const r = await insert(s.scanAmountMl, source, source === 'nfc' ? s.sticker.uid : null);
        return { status: 'logged', ...r };
      }),
    [withLock, insert],
  );

  const logManual = useCallback(
    (amountMl?: number) =>
      withLock(async () => {
        const r = await insert(amountMl ?? settingsRef.current.scanAmountMl, 'manual', null);
        return r.entry;
      }),
    [withLock, insert],
  );

  const deleteEntry = useCallback(
    (id: number) =>
      withLock(async () => {
        await db.deleteIntake(id);
        await loadToday();
        setRevision((r) => r + 1);
      }),
    [withLock, loadToday],
  );

  const resetApp = useCallback(async () => {
    await withLock(async () => {
      await cancelAllReminders().catch(() => undefined);
      await db.eraseAllData();
      settingsRef.current = DEFAULT_SETTINGS;
      setSettings(DEFAULT_SETTINGS);
      await loadToday();
      setRevision((r) => r + 1);
    });
  }, [withLock, loadToday]);

  const value = useMemo<AppStore>(
    () => ({
      ready,
      error,
      settings,
      today,
      revision,
      updateSettings,
      handleStickerTap,
      logManual,
      deleteEntry,
      refreshToday,
      resetApp,
    }),
    [ready, error, settings, today, revision, updateSettings, handleStickerTap, logManual, deleteEntry, refreshToday, resetApp],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside AppStoreProvider');
  return ctx;
}
