export type IntakeSource = 'nfc' | 'shortcut' | 'manual';

export interface IntakeEntry {
  id: number;
  amountMl: number;
  /** Daily goal at the moment this entry was logged (snapshot, never rewritten). */
  goalMl: number;
  /** Epoch milliseconds. */
  createdAt: number;
  /** Local calendar day, `YYYY-MM-DD`. */
  day: string;
  source: IntakeSource;
  tagId: string | null;
}

export interface DaySummary {
  day: string;
  totalMl: number;
  goalMl: number;
  count: number;
}

export interface StickerInfo {
  /** Normalised upper-case hex UID, e.g. `04A2B3C4D5E680`. */
  uid: string;
  registeredAt: number;
  /** Android: whether the current HydraTap link is on the sticker (closed-app tapping). */
  launcherWritten: boolean;
  /** Link format written to the sticker; anything but the current version must be rewritten. */
  linkVersion?: number;
}

export interface ReminderSettings {
  enabled: boolean;
  intervalMin: number;
  /** Minutes after local midnight. */
  startMin: number;
  /** Minutes after local midnight (inclusive). Must be greater than startMin. */
  endMin: number;
}

export interface Settings {
  onboarded: boolean;
  name: string;
  goalMl: number;
  scanAmountMl: number;
  sticker: StickerInfo | null;
  reminders: ReminderSettings;
  allowManualLogging: boolean;
  /** Secret used by the optional iOS Shortcuts automation deep link. */
  shortcutKey: string;
}

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  name: '',
  goalMl: 2500,
  scanAmountMl: 250,
  sticker: null,
  reminders: { enabled: false, intervalMin: 60, startMin: 9 * 60, endMin: 21 * 60 },
  allowManualLogging: false,
  shortcutKey: '',
};

/** Version of the link format written to stickers (1 = old `hydratap://nfc`, no key). */
export const LINK_VERSION = 2;

export const LIMITS = {
  goal: { min: 500, max: 6000, step: 100 },
  scan: { min: 25, max: 2000, step: 25 },
  /** A second tap of the registered sticker within this window is treated as the same scan. */
  scanCooldownMs: 8000,
  reminderIntervals: [30, 45, 60, 90, 120, 180],
} as const;
