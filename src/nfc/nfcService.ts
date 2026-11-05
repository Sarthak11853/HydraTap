import { Platform } from 'react-native';
import NfcManager, { Ndef, NfcAdapter, NfcEvents, NfcTech, TagEvent } from 'react-native-nfc-manager';

import { normalizeTagId } from '../domain/tag';
import { decodeFirstUri, encodeLinkMessage, readNdefType2, writeNdefType2 } from './type2';

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
 * On Android everything (logging, registration, writing/checking the link) runs in
 * one reader mode with SKIP_NDEF_CHECK. Registration needs only the UID of a single
 * quick tap; the link is written with raw NFC Forum Type 2 commands (./type2.ts), so
 * no NDEF detection mode or tag-dispatch round trip is involved.
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
/** True while a write/check owns the NFC reader; tap logging pauses. */
let captureInProgress = false;

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

/**
 * Android reader mode is the only way HydraTap talks to stickers on Android: in-app
 * logging, registration, and writing/checking the link all use the same fast mode
 * (SKIP_NDEF_CHECK), so they behave the same. The native module turns it off on
 * pause and back on on resume.
 */
let readerModeOn = false;
let listening = false;

async function setReaderMode(on: boolean) {
  if (readerModeOn === on) return;
  if (!on) {
    readerModeOn = false;
    await NfcManager.unregisterTagEvent().catch(() => undefined);
    return;
  }
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
    readerModeOn = true;
  } catch {
    // NFC may be off; the status listener restarts listening when it turns on.
  }
}

let onTapHandler: ((uid: string | null) => void) | null = null;
/** A pending "give me the next sticker" request (registration). */
let nextTagWaiter: { resolve: (uid: string) => void; reject: (e: Error) => void } | null = null;

function onDiscoverTag(tag: TagEvent) {
  const uid = normalizeTagId(tag?.id);
  if (nextTagWaiter) {
    const w = nextTagWaiter;
    nextTagWaiter = null;
    if (uid) w.resolve(uid);
    else w.reject(new Error('This tag has no readable ID. Try a different NFC sticker (NTAG213/215/216 work well).'));
    return;
  }
  // When Android resumes HydraTap *because of* a sticker tap, the library also
  // forwards that intent here. The link handler logs it; don't count it twice.
  if (captureInProgress || carriesHydraTapLink(tag)) return;
  onTapHandler?.(uid);
}

/**
 * Android only. Turns on reader mode while HydraTap is in front and calls `onTag`
 * with the UID of each tapped tag (registration requests take precedence).
 */
export async function startTapListening(onTag: (uid: string | null) => void): Promise<() => void> {
  if (!isAndroid || (await initNfc()) === 'unsupported') return () => {};
  onTapHandler = onTag;
  listening = true;
  NfcManager.setEventListener(NfcEvents.DiscoverTag, onDiscoverTag);
  await setReaderMode(true);
  return () => {
    listening = false;
    onTapHandler = null;
    void setReaderMode(false);
  };
}

/** Android: resolves with the UID of the next tapped tag (a single, quick tap). */
function waitForNextTag(): Promise<string> {
  nextTagWaiter?.reject(new NfcCancelledError());
  return new Promise<string>((resolve, reject) => {
    nextTagWaiter = { resolve, reject };
  });
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
const ANDROID_TECHS = [NfcTech.NfcA, NfcTech.NfcB, NfcTech.NfcF, NfcTech.NfcV, NfcTech.IsoDep];

const WRITE_ERRORS = {
  lost: 'The phone moved away before HydraTap finished. Tap again and let the phone rest on the sticker for a moment.',
  readOnly: 'This sticker is locked (read-only), so the HydraTap link can’t be written. Use a new NTAG213/215/216 sticker.',
  tooSmall: 'This sticker is too small to hold the HydraTap link.',
  unsupported: 'This sticker type can’t hold the HydraTap link. Use an NTAG213/215/216 sticker for closed-app tapping (tapping with the app open still works).',
};

function isCancel(e: unknown): boolean {
  const msg = String((e as { message?: string })?.message ?? e ?? '').toLowerCase();
  return (
    e instanceof NfcCancelledError ||
    (e as { constructor?: { name?: string } })?.constructor?.name === 'UserCancel' ||
    msg.includes('cancel')
  );
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
  return isAndroid ? readTagAndroid(options) : readTagIOS(options);
}

async function readTagAndroid(options: {
  writeLink?: string;
  checkLink?: string;
  expectUid?: string;
}): Promise<ReadResult> {
  NfcManager.setEventListener(NfcEvents.DiscoverTag, onDiscoverTag);
  const keepReaderMode = listening;
  await setReaderMode(true);

  // Registration only: the UID from one quick tap, exactly like an in-app tap.
  if (!options.writeLink && !options.checkLink) {
    try {
      const uid = await waitForNextTag();
      if (options.expectUid && options.expectUid !== uid) throw new WrongStickerError();
      return { uid, linkOk: false };
    } finally {
      if (!keepReaderMode && !listening) await setReaderMode(false);
    }
  }

  // Writing / checking the link: connect over NFC-A in the same fast reader mode.
  captureInProgress = true;
  try {
    const tech = await NfcManager.requestTechnology(ANDROID_TECHS);
    const tag = await NfcManager.getTag();
    const uid = normalizeTagId(tag?.id);
    if (!uid) throw new Error('This tag has no readable ID. Try a different NFC sticker (NTAG213/215/216 work well).');
    if (options.expectUid && options.expectUid !== uid) throw new WrongStickerError();
    // NFC Forum Type 2 (NTAG21x / Ultralight) answers on NFC-A with SAK 0x00.
    if (tech !== NfcTech.NfcA || (tag?.sak ?? 0) !== 0) {
      return { uid, linkOk: false, linkError: WRITE_ERRORS.unsupported };
    }
    const tx = (bytes: number[]) => NfcManager.nfcAHandler.transceive(bytes);
    if (options.writeLink) {
      try {
        const outcome = await writeNdefType2(tx, encodeLinkMessage(options.writeLink, ANDROID_PACKAGE));
        if (outcome !== 'ok') return { uid, linkOk: false, linkError: WRITE_ERRORS[outcome] };
        const back = await readNdefType2(tx); // verify: never claim success for a half write
        const ok = !!back && decodeFirstUri(back) === options.writeLink;
        return { uid, linkOk: ok, linkError: ok ? undefined : WRITE_ERRORS.lost };
      } catch {
        return { uid, linkOk: false, linkError: WRITE_ERRORS.lost };
      }
    }
    try {
      const msg = await readNdefType2(tx);
      return { uid, linkOk: !!msg && decodeFirstUri(msg) === options.checkLink };
    } catch {
      return { uid, linkOk: false, linkError: WRITE_ERRORS.lost };
    }
  } catch (e) {
    if (isCancel(e)) throw new NfcCancelledError();
    throw e;
  } finally {
    await NfcManager.cancelTechnologyRequest({ delayMsAndroid: 0 }).catch(() => undefined);
    if (!keepReaderMode && !listening) await setReaderMode(false);
    captureInProgress = false;
  }
}

async function readTagIOS(options: {
  alertMessage: string;
  expectUid?: string;
  validate?: (uid: string) => Promise<{ ok: boolean; message: string }>;
}): Promise<ReadResult> {
  try {
    await NfcManager.requestTechnology(IOS_TECHS, { alertMessage: options.alertMessage });
    const tag = await NfcManager.getTag({ readNdef: false });
    const uid = normalizeTagId(tag?.id);
    if (!uid) {
      await NfcManager.invalidateSessionWithErrorIOS('This tag has no readable ID.');
      throw new Error('This tag has no readable ID. Try a different NFC sticker (NTAG213/215/216 work well).');
    }
    if (options.expectUid && options.expectUid !== uid) {
      await NfcManager.invalidateSessionWithErrorIOS('Not your registered sticker');
      throw new WrongStickerError();
    }
    if (options.validate) {
      const v = await options.validate(uid);
      if (v.ok) await NfcManager.setAlertMessageIOS(v.message);
      else await NfcManager.invalidateSessionWithErrorIOS(v.message);
    } else {
      await NfcManager.setAlertMessageIOS('Sticker detected ✓');
    }
    return { uid, linkOk: false };
  } catch (e) {
    if (isCancel(e)) throw new NfcCancelledError();
    throw e;
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => undefined);
  }
}

/** Cancels a pending `readTag` (Android "Cancel"; iOS has the system sheet). */
export async function cancelRead(): Promise<void> {
  if (nextTagWaiter) {
    const w = nextTagWaiter;
    nextTagWaiter = null;
    w.reject(new NfcCancelledError());
  }
  await NfcManager.cancelTechnologyRequest().catch(() => undefined);
}
