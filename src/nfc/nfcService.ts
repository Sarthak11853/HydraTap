import { Platform } from 'react-native';
import NfcManager, { Ndef, NfcAdapter, NfcEvents, NfcTech, TagEvent } from 'react-native-nfc-manager';

import { normalizeTagId } from '../domain/tag';

/**
 * NFC for HydraTap. Two independent, event-driven paths log a drink:
 *
 * 1. App open (Android): reader mode delivers every tap with the sticker's hardware
 *    UID, which must match the registered sticker.
 *
 * 2. App in background or closed (Android): during setup HydraTap writes an NDEF
 *    message onto the sticker: the link `hydratap://log?key=<secret>` plus an Android
 *    Application Record. Android's tag dispatch then opens HydraTap through an
 *    NDEF_DISCOVERED intent filter (plugins/withNfcLaunchIntent.js), and React
 *    Native's Linking hands the link to JS on cold start (getInitialURL) and on
 *    resume ('url' event). The secret key, known only to this install and its
 *    sticker, proves the tap came from the user's sticker.
 *
 * The same link also serves the optional iOS Shortcuts automation.
 *
 * Platform limits (not workarounds we can code away):
 *  - Android reads stickers only with the screen ON. On the lock screen it reads them
 *    only if the phone's "Require device unlock for NFC" setting is off.
 *  - iOS lets apps read a sticker's ID only inside a user-started scan sheet.
 */

export type NfcStatus = 'unknown' | 'unsupported' | 'disabled' | 'ready';

export const ANDROID_PACKAGE = 'com.hydratap.app';
export function stickerLink(key: string): string {
  return `hydratap://log?key=${key}`;
}

const isIOS = Platform.OS === 'ios';
const isAndroid = Platform.OS === 'android';

let started: Promise<NfcStatus> | null = null;
/** True while a scan screen owns the NFC reader; in-app tap logging pauses. */
let captureInProgress = false;
/** Whether in-app tap listening (Android reader mode) is registered. */
let foregroundActive = false;

export async function initNfc(): Promise<NfcStatus> {
  if (!isIOS && !isAndroid) return 'unsupported';
  if (!started) {
    started = (async (): Promise<NfcStatus> => {
      try {
        if (!(await NfcManager.isSupported())) return 'unsupported';
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
/* Path 1: taps while the app is open (Android reader mode)            */
/* ------------------------------------------------------------------ */

/** True if the tag event carries a HydraTap link (then the Linking path handles it). */
function carriesHydraTapLink(tag: TagEvent): boolean {
  for (const record of tag?.ndefMessage ?? []) {
    try {
      if (Ndef.uri.decodePayload(Uint8Array.from(record.payload)).startsWith('hydratap://')) return true;
    } catch {
      // not a URI record
    }
  }
  return false;
}

async function enableReaderMode() {
  try {
    await NfcManager.registerTagEvent({
      isReaderModeEnabled: true,
      // SKIP_NDEF_CHECK: fast, reliable discovery; we only need the UID here.
      readerModeFlags:
        NfcAdapter.FLAG_READER_NFC_A |
        NfcAdapter.FLAG_READER_NFC_B |
        NfcAdapter.FLAG_READER_NFC_F |
        NfcAdapter.FLAG_READER_NFC_V |
        NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK,
      readerModeDelay: 1000,
    });
  } catch {
    // NFC may be off; the status listener re-registers when it turns on.
  }
}

/**
 * Android only. Calls `onTag` with the UID of each tag tapped while HydraTap is in
 * front. The native module turns reader mode off on pause and back on on resume.
 */
export async function startForegroundListening(onTag: (uid: string | null) => void): Promise<() => void> {
  if (!isAndroid || (await initNfc()) === 'unsupported') return () => {};

  NfcManager.setEventListener(NfcEvents.DiscoverTag, (tag: TagEvent) => {
    // When Android resumes HydraTap *because of* a sticker tap, the library also
    // forwards that intent here. The link handler logs it; don't count it twice.
    if (captureInProgress || carriesHydraTapLink(tag)) return;
    onTag(normalizeTagId(tag?.id));
  });
  foregroundActive = true;
  await enableReaderMode();

  return () => {
    foregroundActive = false;
    NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
    NfcManager.unregisterTagEvent().catch(() => undefined);
  };
}

/* ------------------------------------------------------------------ */
/* Tap diagnostics (Settings → "Tap check")                            */
/* ------------------------------------------------------------------ */

export type TapOutcome = 'logged' | 'duplicate' | 'unknown-tag' | 'no-sticker' | 'no-id' | 'old-link' | 'bad-key' | 'error';

export interface TapRecord {
  at: number;
  uid: string | null;
  outcome: TapOutcome;
  via: 'open' | 'closed' | 'scan';
}

let lastTap: TapRecord | null = null;
const tapListeners = new Set<(t: TapRecord) => void>();

export function recordTap(t: TapRecord) {
  lastTap = t;
  tapListeners.forEach((l) => l(t));
}

export const getLastTap = (): TapRecord | null => lastTap;

export function subscribeTaps(l: (t: TapRecord) => void): () => void {
  tapListeners.add(l);
  return () => tapListeners.delete(l);
}

/* ------------------------------------------------------------------ */
/* One-shot reads: register, write the link, check, iOS scan           */
/* ------------------------------------------------------------------ */

export class NfcCancelledError extends Error {
  constructor() {
    super('cancelled');
  }
}

export class WrongStickerError extends Error {
  constructor() {
    super('This isn’t your registered sticker. Tap the sticker you registered in HydraTap.');
  }
}

export interface ReadResult {
  uid: string;
  /** Android: link written (writeLink) or found (checkLink) on the sticker. */
  linkOk: boolean;
  linkError?: string;
}

const IOS_TECHS = [NfcTech.MifareIOS, NfcTech.Iso15693IOS, NfcTech.IsoDep];
const ANDROID_READ_TECHS = [NfcTech.NfcA, NfcTech.NfcB, NfcTech.NfcF, NfcTech.NfcV, NfcTech.IsoDep];
const ANDROID_NDEF_TECHS = [NfcTech.Ndef, NfcTech.NdefFormatable, ...ANDROID_READ_TECHS];

const WRITE_ERRORS = {
  lost: 'The sticker moved away before HydraTap finished. Keep your phone still on it for about 2 seconds and try again.',
  readOnly: 'This sticker is locked (read-only), so the HydraTap link can’t be written. Use a new NTAG213/215/216 sticker.',
  tooSmall: 'This sticker is too small to hold the HydraTap link.',
  noNdef: 'This sticker type can’t store a link (often MIFARE Classic). NTAG213/215/216 stickers work.',
};

function isCancel(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message ?? e ?? '').toLowerCase();
  return (
    e instanceof NfcCancelledError ||
    (e as { constructor?: { name?: string } })?.constructor?.name === 'UserCancel' ||
    msg.includes('cancel')
  );
}

function linkMessage(link: string): number[] {
  return Ndef.encodeMessage([Ndef.uriRecord(link), Ndef.androidApplicationRecord(ANDROID_PACKAGE)]);
}

/** True if the first record of the connected Ndef tag is exactly `link`. */
async function stickerHasLink(link: string): Promise<boolean> {
  try {
    const tag = await NfcManager.ndefHandler.getNdefMessage();
    const first = tag?.ndefMessage?.[0];
    return !!first && Ndef.uri.decodePayload(Uint8Array.from(first.payload)) === link;
  } catch {
    return false;
  }
}

async function writeLinkTo(tech: NfcTech | null, link: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const bytes = linkMessage(link);
    if (tech === NfcTech.Ndef) {
      const { status, capacity } = await NfcManager.ndefHandler.getNdefStatus();
      if (status === 3 /* ReadOnly */) return { ok: false, error: WRITE_ERRORS.readOnly };
      if (status !== 2 /* ReadWrite */) return { ok: false, error: WRITE_ERRORS.lost };
      if (capacity > 0 && capacity < bytes.length) return { ok: false, error: WRITE_ERRORS.tooSmall };
      await NfcManager.ndefHandler.writeNdefMessage(bytes);
      // Read it back so we never claim success for a half-written sticker.
      return (await stickerHasLink(link)) ? { ok: true } : { ok: false, error: WRITE_ERRORS.lost };
    }
    if (tech === NfcTech.NdefFormatable) {
      await NfcManager.ndefFormatableHandlerAndroid.formatNdef(bytes);
      return { ok: true };
    }
    return { ok: false, error: WRITE_ERRORS.noNdef };
  } catch {
    return { ok: false, error: WRITE_ERRORS.lost };
  }
}

/**
 * Waits for one tag and returns its UID.
 * - iOS: shows the system NFC sheet; `validate` decides the sheet's final message.
 * - Android: waits for a tap (the caller shows "Ready to scan"). With `writeLink` it
 *   writes the HydraTap link; with `checkLink` it only checks whether it's there.
 * Throws NfcCancelledError on cancel.
 */
export async function readTag(options: {
  alertMessage: string;
  writeLink?: string;
  checkLink?: string;
  /** Reject any other tag before writing anything. */
  expectUid?: string;
  validate?: (uid: string) => Promise<{ ok: boolean; message: string }>;
}): Promise<ReadResult> {
  const status = await initNfc();
  if (status === 'unsupported') throw new Error('NFC is not available on this device.');
  if (status === 'disabled') throw new Error('NFC is turned off. Turn it on in system settings.');

  const needsNdef = isAndroid && !!(options.writeLink || options.checkLink);
  captureInProgress = true;
  // Reader mode (SKIP_NDEF_CHECK) hides the Ndef technology. Pause it so the
  // library falls back to normal foreground dispatch, then restore it afterwards.
  const pausedReaderMode = isAndroid && foregroundActive;
  if (pausedReaderMode) await NfcManager.unregisterTagEvent().catch(() => undefined);

  try {
    const techs = isIOS ? IOS_TECHS : needsNdef ? ANDROID_NDEF_TECHS : ANDROID_READ_TECHS;
    const tech = await NfcManager.requestTechnology(techs, { alertMessage: options.alertMessage });
    const tag = await NfcManager.getTag(isIOS ? { readNdef: false } : undefined);
    const uid = normalizeTagId(tag?.id);
    if (!uid) {
      if (isIOS) await NfcManager.invalidateSessionWithErrorIOS('This tag has no readable ID.');
      throw new Error('This tag has no readable ID. Try a different NFC sticker (NTAG213/215/216 work well).');
    }
    if (options.expectUid && options.expectUid !== uid) {
      if (isIOS) await NfcManager.invalidateSessionWithErrorIOS('Not your registered sticker');
      throw new WrongStickerError();
    }

    let linkOk = false;
    let linkError: string | undefined;
    if (isAndroid && options.writeLink) {
      const r = await writeLinkTo(tech, options.writeLink);
      linkOk = r.ok;
      linkError = r.error;
    } else if (isAndroid && options.checkLink) {
      linkOk = tech === NfcTech.Ndef && (await stickerHasLink(options.checkLink));
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
    return { uid, linkOk, linkError };
  } catch (e) {
    if (isCancel(e)) throw new NfcCancelledError();
    throw e;
  } finally {
    await NfcManager.cancelTechnologyRequest({ delayMsAndroid: 300 }).catch(() => undefined);
    if (pausedReaderMode && foregroundActive) await enableReaderMode();
    captureInProgress = false;
  }
}

/** Cancels a pending `readTag` (Android "Cancel"; iOS has the system sheet). */
export async function cancelRead(): Promise<void> {
  await NfcManager.cancelTechnologyRequest().catch(() => undefined);
}
