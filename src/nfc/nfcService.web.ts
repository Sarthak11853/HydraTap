/** Web preview only: browsers can't read NFC sticker IDs, so NFC reports "unsupported". */
import type { ReadResult, TapRecord } from './nfcService';

export type { NfcStatus, ReadResult, TapOutcome, TapRecord } from './nfcService';
export const ANDROID_PACKAGE = 'com.hydratap.app';
export const stickerLink = (key: string) => `hydratap://log?key=${key}`;

export class NfcCancelledError extends Error {
  constructor() {
    super('cancelled');
  }
}
export class WrongStickerError extends Error {}

export const initNfc = async () => 'unsupported' as const;
export const refreshNfcStatus = initNfc;
export const onNfcStateChange = (_cb: unknown) => () => {};
export const openNfcSettings = async () => {};
export const startForegroundListening = async (_onTag: unknown) => () => {};
export const readTag = async (_o: unknown): Promise<ReadResult> => {
  throw new Error('NFC is not available in the browser preview.');
};
export const cancelRead = async () => {};
export const recordTap = (_t: TapRecord) => {};
export const getLastTap = (): TapRecord | null => null;
export const subscribeTaps = (_l: (t: TapRecord) => void) => () => {};
