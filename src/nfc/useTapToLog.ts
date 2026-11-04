import * as Linking from 'expo-linking';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { useToast } from '../components/Toast';
import { formatVolume, remainingMl } from '../domain/format';
import { TapResult, useApp } from '../state/AppStore';
import {
  initNfc,
  NfcCancelledError,
  NfcStatus,
  onNfcStateChange,
  readTag,
  refreshNfcStatus,
  startForegroundListening,
  takeLaunchTagUid,
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

/** Parses `hydratap://log?key=…` (the iOS Shortcuts automation URL). */
function parseShortcutKey(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = Linking.parse(url);
    const path = (parsed.hostname ?? '') + (parsed.path ?? '');
    if (!path.replace(/\//g, '').startsWith('log')) return null;
    const key = parsed.queryParams?.key;
    return typeof key === 'string' && key.length > 0 ? key : null;
  } catch {
    return null;
  }
}

let initialUrlHandled = false;

/**
 * Mounted once at the root. Wires up every *event-driven* path that can log water:
 *  - Android: reader-mode taps while open, and the launch/resume tag when Android
 *    starts HydraTap from the registered sticker (background / closed app).
 *  - iOS: the Shortcuts automation deep link (`hydratap://log?key=…`).
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

  const onTap = useCallback(
    async (uid: string | null, source: 'nfc' | 'shortcut') => {
      try {
        const result = await handleStickerTap(uid, source);
        announce(result, goalRef.current, notify);
      } catch {
        notify({ tone: 'error', title: 'Could not log water', message: 'Please try again.' });
      }
    },
    [handleStickerTap, notify],
  );

  const enabled = ready && settings.onboarded;

  // NFC availability + state changes.
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

  // Android: foreground reader mode + launch tag.
  useEffect(() => {
    if (!enabled || Platform.OS !== 'android' || nfcStatus === 'unsupported' || nfcStatus === 'unknown') return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    startForegroundListening((uid) => onTap(uid, 'nfc')).then((fn) => {
      if (cancelled) fn();
      else stop = fn;
    });
    const checkLaunchTag = () =>
      takeLaunchTagUid().then((uid) => {
        if (uid) onTap(uid, 'nfc');
      });
    checkLaunchTag();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && checkLaunchTag());
    return () => {
      cancelled = true;
      stop?.();
      sub.remove();
    };
  }, [enabled, nfcStatus, onTap]);

  // iOS Shortcuts automation deep link (works on Android too, harmlessly).
  useEffect(() => {
    if (!enabled) return;
    const handle = (url: string | null) => {
      const key = parseShortcutKey(url);
      if (!key) return;
      if (keyRef.current && key === keyRef.current) onTap(null, 'shortcut');
      else notify({ tone: 'warning', title: 'Shortcut link not recognised', message: 'Copy the latest link from Settings.' });
    };
    if (!initialUrlHandled) {
      initialUrlHandled = true;
      Linking.getInitialURL().then(handle);
    }
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, [enabled, onTap, notify]);

  return { nfcStatus };
}

/**
 * iOS: user-initiated scan from the Home screen. Opens the system NFC sheet and
 * reports the outcome inside the sheet and as a toast. (Also works on Android as an
 * explicit scan, although Android logs automatically while the app is open.)
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
