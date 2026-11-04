/**
 * Web preview only: in-memory implementation of ./database.ts with the same API,
 * so the UI can be previewed in a browser (`npm run web`). Native builds use
 * SQLite. Append `?demo` to the URL to start with sample data.
 */
import { addDays, dayKey, startOfDay } from '../domain/dates';
import type { DaySummary, IntakeEntry, IntakeSource, Settings } from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';

let settings: Settings = { ...DEFAULT_SETTINGS };
let rows: IntakeEntry[] = [];
let nextId = 1;

const isDemo = typeof window !== 'undefined' && /[?&]demo\b/.test(window.location.search);
if (isDemo) {
  settings = {
    ...DEFAULT_SETTINGS,
    onboarded: true,
    name: 'Sarthak',
    sticker: { uid: '04A2B3C4D5E680', registeredAt: Date.now() - 9 * 864e5, launcherWritten: true },
    reminders: { ...DEFAULT_SETTINGS.reminders, enabled: true },
    shortcutKey: 'demo',
  };
  const today = startOfDay();
  const pattern = [9, 11, 7, 10, 12, 8, 10, 6, 11, 9];
  pattern.forEach((count, i) => {
    const d = addDays(today, -(i + 1));
    for (let k = 0; k < count; k++) {
      const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 8 + Math.floor((k * 13) / count), (k * 23) % 60).getTime();
      rows.push({ id: nextId++, amountMl: 250, goalMl: 2500, createdAt: t, day: dayKey(t), source: k % 5 === 4 ? 'manual' : 'nfc', tagId: null });
    }
  });
  const now = new Date();
  for (let k = 0; k < 6; k++) {
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8 + k, 10 + k * 7).getTime();
    if (t < now.getTime()) rows.push({ id: nextId++, amountMl: 250, goalMl: 2500, createdAt: t, day: dayKey(t), source: 'nfc', tagId: null });
  }
}

const byNewest = (a: IntakeEntry, b: IntakeEntry) => b.createdAt - a.createdAt;

export async function getDb(): Promise<void> {}

export async function loadSettings(): Promise<Settings> {
  return { ...settings };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  settings = { ...settings, ...patch };
}

export async function insertIntake(input: {
  amountMl: number;
  goalMl: number;
  source: IntakeSource;
  tagId?: string | null;
  createdAt?: number;
}): Promise<IntakeEntry> {
  const createdAt = input.createdAt ?? Date.now();
  const e: IntakeEntry = {
    id: nextId++,
    amountMl: Math.round(input.amountMl),
    goalMl: Math.round(input.goalMl),
    createdAt,
    day: dayKey(createdAt),
    source: input.source,
    tagId: input.tagId ?? null,
  };
  rows.push(e);
  return e;
}

export async function deleteIntake(id: number): Promise<void> {
  rows = rows.filter((r) => r.id !== id);
}

export async function getEntriesForDay(day: string): Promise<IntakeEntry[]> {
  return rows.filter((r) => r.day === day).sort(byNewest);
}

export async function getLastScanAt(): Promise<number | null> {
  const t = rows.filter((r) => r.source !== 'manual').map((r) => r.createdAt);
  return t.length ? Math.max(...t) : null;
}

export async function getDaySummaries(limit: number, offset = 0): Promise<DaySummary[]> {
  const map = new Map<string, DaySummary & { last: number }>();
  for (const r of rows) {
    const s = map.get(r.day) ?? { day: r.day, totalMl: 0, goalMl: r.goalMl, count: 0, last: 0 };
    s.totalMl += r.amountMl;
    s.count += 1;
    if (r.createdAt > s.last) {
      s.last = r.createdAt;
      s.goalMl = r.goalMl;
    }
    map.set(r.day, s);
  }
  return [...map.values()]
    .sort((a, b) => (a.day < b.day ? 1 : -1))
    .slice(offset, offset + limit)
    .map(({ day, totalMl, goalMl, count }) => ({ day, totalMl, goalMl, count }));
}

export async function getEntriesBetween(fromDay: string, toDay: string): Promise<IntakeEntry[]> {
  return rows.filter((r) => r.day >= fromDay && r.day <= toDay).sort(byNewest);
}

export async function getTotalsForDays(days: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const r of rows) if (days.includes(r.day)) out[r.day] = (out[r.day] ?? 0) + r.amountMl;
  return out;
}

export async function getLifetimeStats(): Promise<{ totalMl: number; days: number; entries: number }> {
  return {
    totalMl: rows.reduce((s, r) => s + r.amountMl, 0),
    days: new Set(rows.map((r) => r.day)).size,
    entries: rows.length,
  };
}

export async function eraseAllData(): Promise<void> {
  rows = [];
  settings = { ...DEFAULT_SETTINGS };
}
