import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';

import { useToast } from '../components/Toast';
import { formatVolume, remainingMl } from '../domain/format';
import { parseHydraTapLink } from '../domain/link';
import { TapResult, useApp } from '../state/AppStore';
import {
  initNfc,
  NfcCancelledError,
  NfcStatus,
  onNfcStateChange,
  readTag,
  recordTap,
  refreshNfcStatus,
  startTapListening,
  TapRecord,
} from './nfcService';

type Notify = ReturnType<typeof useToast>;

function announce(result: TapResult, goalMl: number, notify: Notify) {
  switch (result.status) {
    case 'logged': {
      const left = remainingMl(result.totalMl, goalMl);
      if (result.goalReachedNow) {
        notify({ tone: 'success', title: 'Daily goal reached! 🎉', message: `+${formatVolume(result.entry.amountMl)} — beautifully hydrated today.` });
      } else {
        notify({
          tone: 'success',
          title: `+${formatVolume(result.entry.amountMl)} logged 💧`,
          message: left > 0 ? `${formatVolume(left)} to go today` : 'Goal already reached — nice!',
        });
      }
      break;
    }
    case 'duplicate':
      notify({ tone: 'info', title: 'Already logged', message: 'That tap was just counted.' });
      break;
    case 'unknown-tag':
      notify({ tone: 'warning', title: 'Not your HydraTap sticker', message: 'This tag was ignored.' });
      break;
    case 'no-sticker':
      notify({ tone: 'info', title: 'No sticker registered', message: 'Register one in Settings → NFC sticker.' });
      break;
  }
}

/**
 * Each sticker tap must be handled exactly once. Android NFC launches carry a unique
 * `t` nonce; links without one (iOS Shortcuts) are handled once per process start.
 */
const handledNonces = new Set<string>();
let initialUrlHandled = false;

function firstTime(nonce: string | null, isInitial: boolean): boolean {
  if (nonce) {
    if (handledNonces.has(nonce)) return false;
    handledNonces.add(nonce);
    return true;
  }
  if (!isInitial) return true;
  if (initialUrlHandled) return false;
  initialUrlHandled = true;
  return true;
}

/**
 * Mounted once at the root. Wires up every event-driven way a drink is logged:
 *  - Android, app open: reader-mode taps (UID must match the registered sticker).
 *  - Android, app in background / closed: the sticker's `hydratap://log?key=…` link
 *    opens HydraTap; the key must match. Same link for the iOS Shortcuts automation.
 * Nothing here polls.
 */
export function useStickerTapLogging(): { nfcStatus: NfcStatus } {
  const { ready, settings, handleStickerTap } = useApp();
  const notify = useToast();
  const [nfcStatus, setNfcStatus] = useState<NfcStatus>('unknown');

  const goalRef = useRef(settings.goalMl);
  const keyRef = useRef(settings.shortcutKey);
  useEffect(() => {
    goalRef.current = settings.goalMl;
    keyRef.current = settings.shortcutKey;
  }, [settings.goalMl, settings.shortcutKey]);

  const log = useCallback(
    async (uid: string | null, via: TapRecord['via'], byLink: boolean) => {
      try {
        const source = byLink && Platform.OS === 'ios' ? 'shortcut' : 'nfc';
        const result = await handleStickerTap(uid, source, byLink);
        recordTap({ at: Date.now(), uid, outcome: result.status, via });
        announce(result, goalRef.current, notify);
      } catch {
        recordTap({ at: Date.now(), uid, outcome: 'error', via });
        notify({ tone: 'error', title: 'Could not log water', message: 'Please try again.' });
      }
    },
    [handleStickerTap, notify],
  );

  const enabled = ready && settings.onboarded;

  // NFC availability + on/off changes.
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    initNfc().then((s) => alive && setNfcStatus(s));
    const off = onNfcStateChange((s) => setNfcStatus(s));
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') refreshNfcStatus().then((s) => alive && setNfcStatus(s));
    });
    return () => {
      alive = false;
      off();
      sub.remove();
    };
  }, [ready]);

  const onboardedRef = useRef(settings.onboarded);
  useEffect(() => {
    onboardedRef.current = settings.onboarded;
  }, [settings.onboarded]);

  // Android, app open: reader mode. It runs from launch (also during onboarding, where
  // it powers sticker registration); drinks are only logged once set up.
  useEffect(() => {
    if (!ready || Platform.OS !== 'android' || nfcStatus !== 'ready') return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    startTapListening((uid: string | null) => {
      if (!onboardedRef.current) return;
      if (uid) log(uid, 'open', false);
      else recordTap({ at: Date.now(), uid: null, outcome: 'no-id', via: 'open' });
    }).then((fn: () => void) => {
      if (cancelled) fn();
      else stop = fn;
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [ready, nfcStatus, log]);

  // App in background / closed: the sticker link (and iOS Shortcuts) via Linking.
  useEffect(() => {
    if (!enabled) return;
    const handle = (url: string | null | undefined, isInitial: boolean) => {
      const link = parseHydraTapLink(url);
      if (!link || !firstTime(link.nonce, isInitial)) return;
      if (link.kind === 'old') {
        recordTap({ at: Date.now(), uid: null, outcome: 'old-link', via: 'closed' });
        notify({ tone: 'warning', title: 'Update your sticker', message: 'Tap “Enable tapping when the app is closed” on Home once.' });
        return;
      }
      if (link.key && keyRef.current && link.key === keyRef.current) {
        log(null, 'closed', true);
      } else {
        recordTap({ at: Date.now(), uid: null, outcome: 'bad-key', via: 'closed' });
        notify({ tone: 'warning', title: 'Sticker link not recognised', message: 'Write the link again: Settings → NFC sticker.' });
      }
    };
    // Cold start (and a recreated activity) deliver the link as the initial URL;
    // re-check it whenever the app comes to the front. Nonces prevent repeats.
    const checkInitial = () => Linking.getInitialURL().then((url) => handle(url, true));
    checkInitial();
    const appSub = AppState.addEventListener('change', (st) => st === 'active' && checkInitial());
    const sub = Linking.addEventListener('url', ({ url }) => handle(url, false));
    return () => {
      sub.remove();
      appSub.remove();
    };
  }, [enabled, log, notify]);

  return { nfcStatus };
}

/**
 * iOS: user-initiated scan from Home. Opens the system NFC sheet and reports the
 * outcome inside the sheet and as a toast.
 */
export function useScanToLog() {
  const { settings, handleStickerTap } = useApp();
  const notify = useToast();
  const [scanning, setScanning] = useState(false);

  const scan = useCallback(async () => {
    if (scanning) return;
    setScanning(true);
    let result: TapResult | null = null;
    try {
      await readTag({
        alertMessage: 'Hold your iPhone near your HydraTap sticker',
        validate: async (uid) => {
          result = await handleStickerTap(uid, 'nfc');
          recordTap({ at: Date.now(), uid, outcome: result.status, via: 'scan' });
          switch (result.status) {
            case 'logged':
              return { ok: true, message: `+${formatVolume(result.entry.amountMl)} logged 💧` };
            case 'duplicate':
              return { ok: true, message: 'Already logged a moment ago' };
            case 'unknown-tag':
              return { ok: false, message: 'Not your HydraTap sticker' };
            default:
              return { ok: false, message: 'Register a sticker first' };
          }
        },
      });
      if (result) announce(result, settings.goalMl, notify);
    } catch (e) {
      if (!(e instanceof NfcCancelledError)) {
        notify({ tone: 'error', title: 'Scan failed', message: String((e as Error)?.message ?? e) });
      }
    } finally {
      setScanning(false);
    }
  }, [scanning, handleStickerTap, settings.goalMl, notify]);

  return { scan, scanning };
}

const NfcStatusContext = createContext<NfcStatus>('unknown');

/** Root component that enables tap logging and shares the NFC status with screens. */
export function StickerTapLoggingProvider({ children }: { children: React.ReactNode }) {
  const { nfcStatus } = useStickerTapLogging();
  return React.createElement(NfcStatusContext.Provider, { value: nfcStatus }, children);
}

export const useNfcStatus = () => useContext(NfcStatusContext);
