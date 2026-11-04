/** Web preview only: browsers can't read NFC sticker UIDs, so NFC reports "unsupported". */
import type { ReadResult } from './nfcService';

export type NfcStatus = 'unknown' | 'unsupported' | 'disabled' | 'ready';
export const STICKER_URI = 'hydratap://nfc';
export const ANDROID_PACKAGE = 'com.hydratap.app';

export class NfcCancelledError extends Error {
  constructor() {
    super('cancelled');
  }
}

export const initNfc = async (): Promise<NfcStatus> => 'unsupported';
export const refreshNfcStatus = initNfc;
export const onNfcStateChange = (_cb: (s: NfcStatus) => void) => () => {};
export const openNfcSettings = async () => {};
export const startForegroundListening = async (_onTag: (uid: string) => void) => () => {};
export const takeLaunchTagUid = async (): Promise<string | null> => null;
export const readTag = async (_o: unknown): Promise<ReadResult> => {
  throw new Error('NFC is not available in the browser preview.');
};
export const cancelRead = async () => {};
export const shortcutUrl = (key: string) => `hydratap://log?key=${key}`;
export class WrongStickerError extends Error {}

export type TapOutcome = 'logged' | 'duplicate' | 'unknown-tag' | 'no-sticker' | 'no-id' | 'ignored-busy' | 'error';
export interface TapRecord {
  at: number;
  uid: string | null;
  outcome: TapOutcome;
  via?: 'open' | 'launch' | 'scan' | 'shortcut';
}
export const recordTap = (_t: TapRecord) => {};
export const getLastTap = (): TapRecord | null => null;
export const subscribeTaps = (_l: (t: TapRecord) => void) => () => {};
