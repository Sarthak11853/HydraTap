import { Platform } from 'react-native';
import NfcManager, { Ndef, NfcAdapter, NfcEvents, NfcTech, TagEvent } from 'react-native-nfc-manager';

import { normalizeTagId } from '../domain/tag';

/**
 * Thin, event-driven wrapper around react-native-nfc-manager.
 *
 * Platform facts this module is built on (verified against Apple / Android docs
 * and the library source):
 *
 * iOS
 *  - Reading a tag's UID requires an NFCTagReaderSession (`requestTechnology` with
 *    MIFARE / ISO 15693 / ISO 7816). The NDEF reader session does NOT expose the UID.
 *  - Every in-app read must be started by the user and shows the system NFC sheet.
 *    Third-party apps cannot poll for tags in the background.
 *  - Background Tag Reading (iPhone XS+) only works for NDEF URLs that are
 *    Universal Links (custom schemes are not supported) and never exposes the UID,
 *    so HydraTap offers the official Shortcuts "NFC" personal automation instead
 *    (see `shortcutUrl`).
 *
 * Android
 *  - While HydraTap is in the foreground we enable reader mode; the NFC controller
 *    discovers tags and the OS pushes an event — no JS polling.
 *  - When the app is in the background or closed, Android's tag dispatch launches
 *    HydraTap for stickers carrying the HydraTap NDEF record (written during
 *    registration) via an NDEF_DISCOVERED intent filter. The intent still contains
 *    the real UID, which we verify before logging.
 *  - Tags are only discovered while the screen is on and (on most devices) unlocked.
 */

export type NfcStatus = 'unknown' | 'unsupported' | 'disabled' | 'ready';

export const STICKER_URI = 'hydratap://nfc';
export const ANDROID_PACKAGE = 'com.hydratap.app';

let started: Promise<NfcStatus> | null = null;
/** While a registration read is active, foreground taps must not log water. */
let captureInProgress = false;

const isIOS = Platform.OS === 'ios';
const isAndroid = Platform.OS === 'android';

export async function initNfc(): Promise<NfcStatus> {
  if (!isIOS && !isAndroid) return 'unsupported';
  if (!started) {
    started = (async (): Promise<NfcStatus> => {
      try {
        const supported = await NfcManager.isSupported();
        if (!supported) return 'unsupported';
        await NfcManager.start();
        return (await NfcManager.isEnabled()) ? 'ready' : 'disabled';
      } catch {
        started = null;
        return 'unsupported';
      }
    })();
  }
  return started;
}

export async function refreshNfcStatus(): Promise<NfcStatus> {
  const status = await initNfc();
  if (status === 'unsupported') return status;
  try {
    return (await NfcManager.isEnabled()) ? 'ready' : 'disabled';
  } catch {
    return 'unsupported';
  }
}

export function onNfcStateChange(cb: (status: NfcStatus) => void): () => void {
  if (!isAndroid) return () => {};
  NfcManager.setEventListener(NfcEvents.StateChanged, (evt) => {
    if (evt?.state === 'on') cb('ready');
    else if (evt?.state === 'off') cb('disabled');
  });
  return () => NfcManager.setEventListener(NfcEvents.StateChanged, null);
}

export async function openNfcSettings(): Promise<void> {
  if (isAndroid) await NfcManager.goToNfcSetting().catch(() => undefined);
}

/* ------------------------------------------------------------------ */
/* Android: foreground listening + background launch tag               */
/* ------------------------------------------------------------------ */

/**
 * Android only. Enables reader mode while HydraTap is resumed and calls `onTag`
 * with the normalised UID of each discovered tag. The native module disables
 * reader mode automatically when the activity pauses and re-enables it on resume.
 */
export async function startForegroundListening(onTag: (uid: string) => void): Promise<() => void> {
  if (!isAndroid) return () => {};
  const status = await initNfc();
  if (status === 'unsupported') return () => {};

  const handler = (tag: TagEvent) => {
    if (captureInProgress) return;
    const uid = normalizeTagId(tag?.id);
    if (uid) onTag(uid);
  };
  NfcManager.setEventListener(NfcEvents.DiscoverTag, handler);
  // Delivered when Android brings HydraTap to the front for a sticker tap.
  NfcManager.setEventListener(NfcEvents.DiscoverBackgroundTag, (tag: TagEvent) => {
    NfcManager.clearBackgroundTag().catch(() => undefined);
    handler(tag);
  });

  try {
    await NfcManager.registerTagEvent({
      isReaderModeEnabled: true,
      readerModeFlags:
        NfcAdapter.FLAG_READER_NFC_A |
        NfcAdapter.FLAG_READER_NFC_B |
        NfcAdapter.FLAG_READER_NFC_F |
        NfcAdapter.FLAG_READER_NFC_V |
        NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK,
      readerModeDelay: 1000,
    });
  } catch {
    // NFC may be off; StateChanged + refresh will retry.
  }

  return () => {
    NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
    NfcManager.setEventListener(NfcEvents.DiscoverBackgroundTag, null);
    NfcManager.unregisterTagEvent().catch(() => undefined);
  };
}

/**
 * Android only. Returns the UID of the tag that launched / resumed HydraTap
 * (NDEF_DISCOVERED intent), consuming it so it is handled once.
 */
let launchTagCheck: Promise<string | null> | null = null;

export function takeLaunchTagUid(): Promise<string | null> {
  if (!isAndroid) return Promise.resolve(null);
  // Single-flight: mount and the first "active" event can race on cold start.
  if (launchTagCheck) return launchTagCheck.then(() => null);
  launchTagCheck = (async () => {
    const status = await initNfc();
    if (status === 'unsupported') return null;
    try {
      const tag = await NfcManager.getBackgroundTag();
      if (!tag) return null;
      await NfcManager.clearBackgroundTag();
      return normalizeTagId(tag.id);
    } catch {
      return null;
    }
  })().finally(() => {
    launchTagCheck = null;
  });
  return launchTagCheck;
}

/* ------------------------------------------------------------------ */
/* One-shot reads (registration on both platforms, logging on iOS)     */
/* ------------------------------------------------------------------ */

export class NfcCancelledError extends Error {
  constructor() {
    super('cancelled');
  }
}

export interface ReadResult {
  uid: string;
  /** Android only: whether the HydraTap launch record was written. */
  launcherWritten: boolean;
  launcherError?: string;
}

const IOS_TECHS = [NfcTech.MifareIOS, NfcTech.Iso15693IOS, NfcTech.IsoDep];
const ANDROID_READ_TECHS = [NfcTech.NfcA, NfcTech.NfcB, NfcTech.NfcF, NfcTech.NfcV, NfcTech.IsoDep];
const ANDROID_WRITE_TECHS = [NfcTech.Ndef, NfcTech.NdefFormatable, ...ANDROID_READ_TECHS];

function isCancel(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message ?? e ?? '').toLowerCase();
  return (
    e instanceof NfcCancelledError ||
    (e as { constructor?: { name?: string } })?.constructor?.name === 'UserCancel' ||
    msg.includes('cancel')
  );
}

function launcherMessage(): number[] {
  return Ndef.encodeMessage([Ndef.uriRecord(STICKER_URI), Ndef.androidApplicationRecord(ANDROID_PACKAGE)]);
}

async function tryWriteLauncher(tech: NfcTech | null): Promise<{ ok: boolean; error?: string }> {
  try {
    if (tech === NfcTech.Ndef) {
      const { status, capacity } = await NfcManager.ndefHandler.getNdefStatus();
      const bytes = launcherMessage();
      if (status !== 2 /* ReadWrite */) return { ok: false, error: 'This sticker is read-only.' };
      if (capacity > 0 && capacity < bytes.length) return { ok: false, error: 'This sticker is too small.' };
      await NfcManager.ndefHandler.writeNdefMessage(bytes);
      return { ok: true };
    }
    if (tech === NfcTech.NdefFormatable) {
      await NfcManager.ndefFormatableHandlerAndroid.formatNdef(launcherMessage());
      return { ok: true };
    }
    return { ok: false, error: 'This sticker does not support NDEF.' };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? 'Write failed') };
  }
}

/**
 * Waits for a tag and returns its UID.
 * - iOS: presents the system NFC sheet. `validate` decides the final sheet message.
 * - Android: waits silently for a tap (callers show their own "Ready to scan" UI)
 *   and can optionally write the HydraTap launch record for closed-app logging.
 *
 * Throws NfcCancelledError when the user cancels.
 */
export async function readTag(options: {
  alertMessage: string;
  writeLauncher?: boolean;
  validate?: (uid: string) => Promise<{ ok: boolean; message: string }>;
}): Promise<ReadResult> {
  const status = await initNfc();
  if (status === 'unsupported') throw new Error('NFC is not available on this device.');
  if (status === 'disabled') throw new Error('NFC is turned off. Turn it on in system settings.');

  captureInProgress = true;
  try {
    const techs = isIOS ? IOS_TECHS : options.writeLauncher ? ANDROID_WRITE_TECHS : ANDROID_READ_TECHS;
    const tech = await NfcManager.requestTechnology(techs, { alertMessage: options.alertMessage });
    const tag = await NfcManager.getTag(isIOS ? { readNdef: false } : undefined);
    const uid = normalizeTagId(tag?.id);
    if (!uid) {
      if (isIOS) await NfcManager.invalidateSessionWithErrorIOS('This tag has no readable ID.');
      throw new Error('This tag has no readable ID. Try a different NFC sticker (NTAG213/215/216 work well).');
    }

    let launcherWritten = false;
    let launcherError: string | undefined;
    if (isAndroid && options.writeLauncher) {
      const r = await tryWriteLauncher(tech);
      launcherWritten = r.ok;
      launcherError = r.error;
    }

    if (options.validate) {
      const v = await options.validate(uid);
      if (isIOS) {
        if (v.ok) await NfcManager.setAlertMessageIOS(v.message);
        else await NfcManager.invalidateSessionWithErrorIOS(v.message);
      }
    } else if (isIOS) {
      await NfcManager.setAlertMessageIOS('Sticker detected ✓');
    }
    return { uid, launcherWritten, launcherError };
  } catch (e) {
    if (isCancel(e)) throw new NfcCancelledError();
    throw e;
  } finally {
    await NfcManager.cancelTechnologyRequest({ delayMsAndroid: 300 }).catch(() => undefined);
    captureInProgress = false;
  }
}

/** Cancels a pending `readTag` (Android "Cancel" button; iOS has the system sheet). */
export async function cancelRead(): Promise<void> {
  await NfcManager.cancelTechnologyRequest().catch(() => undefined);
}

/** Deep link used by the optional iOS Shortcuts NFC automation. */
export function shortcutUrl(key: string): string {
  return `hydratap://log?key=${key}`;
}
