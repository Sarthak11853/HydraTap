import type { ReminderSettings } from './types.ts';
import { addDays, startOfDay } from './dates.ts';

/** iOS keeps at most 64 pending local notifications per app; stay safely below. */
export const MAX_PENDING_REMINDERS = 60;
export const MAX_REMINDER_DAYS = 7;

/** Minutes after midnight at which reminders fire each day. */
export function reminderSlots(settings: Pick<ReminderSettings, 'intervalMin' | 'startMin' | 'endMin'>): number[] {
  const { intervalMin, startMin, endMin } = settings;
  if (intervalMin <= 0 || endMin < startMin) return [];
  const slots: number[] = [];
  for (let m = startMin; m <= endMin && m < 24 * 60; m += intervalMin) slots.push(m);
  return slots;
}

export interface PlanInput {
  now: number;
  settings: ReminderSettings;
  todayTotalMl: number;
  goalMl: number;
  /** Timestamp of today's latest intake, if any. */
  lastIntakeAt: number | null;
}

export interface PlannedReminder {
  at: number;
  /** True when the reminder belongs to the current day (content can mention remaining amount). */
  isToday: boolean;
}

/**
 * Plans upcoming one-shot reminders as a rolling window.
 *
 * - Today's remaining slots are skipped entirely once the goal is reached.
 * - Today's slots closer than one interval to the latest drink are skipped, so a
 *   reminder never fires right after the user just drank.
 * - Following days are filled until the pending-notification budget is used,
 *   capped at MAX_REMINDER_DAYS. The window is refreshed whenever the app opens,
 *   water is logged, or settings change.
 */
export function planReminders(input: PlanInput): PlannedReminder[] {
  const { now, settings, todayTotalMl, goalMl, lastIntakeAt } = input;
  if (!settings.enabled) return [];
  const slots = reminderSlots(settings);
  if (slots.length === 0) return [];

  const out: PlannedReminder[] = [];
  const today = startOfDay(now);
  const goalReached = goalMl > 0 && todayTotalMl >= goalMl;
  const minGapMs = settings.intervalMin * 60_000;

  for (let dayOffset = 0; dayOffset < MAX_REMINDER_DAYS; dayOffset++) {
    if (dayOffset === 0 && goalReached) continue;
    const base = addDays(today, dayOffset);
    for (const slot of slots) {
      const at = new Date(base.getFullYear(), base.getMonth(), base.getDate(), Math.floor(slot / 60), slot % 60).getTime();
      if (at <= now + 30_000) continue;
      if (dayOffset === 0 && lastIntakeAt !== null && at - lastIntakeAt < minGapMs) continue;
      out.push({ at, isToday: dayOffset === 0 });
      if (out.length >= MAX_PENDING_REMINDERS) return out;
    }
  }
  return out;
}

const TODAY_LINES = [
  (r: string) => `A few sips keep you going — ${r} to go today.`,
  (r: string) => `Time for some water! ${r} left to reach your goal.`,
  (r: string) => `Stay fresh 💧 Just ${r} more today.`,
  (r: string) => `Your bottle misses you. ${r} remaining.`,
];
const GENERIC_LINES = [
  'Time for a glass of water 💧',
  'A quick sip keeps you sharp. Tap your sticker!',
  'Hydration check — how about some water?',
  'Stay refreshed: grab your bottle and tap to log.',
];

export function reminderMessage(index: number, isToday: boolean, remaining: string): { title: string; body: string } {
  const title = 'Time to hydrate';
  if (isToday) return { title, body: TODAY_LINES[index % TODAY_LINES.length](remaining) };
  return { title, body: GENERIC_LINES[index % GENERIC_LINES.length] };
}
