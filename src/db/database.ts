import * as SQLite from 'expo-sqlite';

import { dayKey } from '../domain/dates';
import type { DaySummary, IntakeEntry, IntakeSource, Settings } from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';

/**
 * Local, offline SQLite storage.
 *
 * Tables
 *  - settings(key, value): JSON-encoded preferences (name, goal, sticker, reminders…)
 *  - intake: immutable log of every drink. Each row stores the amount AND the goal
 *    in effect at that moment, so changing settings never rewrites history.
 */
const DB_NAME = 'hydratap.db';
const SCHEMA_VERSION = 1;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openHealthyDb().catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

async function openHealthyDb(): Promise<SQLite.SQLiteDatabase> {
  let db: SQLite.SQLiteDatabase | null = null;
  try {
    db = await SQLite.openDatabaseAsync(DB_NAME);
    await migrate(db);
    const check = await db.getFirstAsync<{ quick_check: string }>('PRAGMA quick_check');
    if (check?.quick_check === 'ok') return db;
  } catch {
    // fall through to repair
  }
  return repairDb(db);
}

/**
 * Last-resort repair (an earlier build's background logger wrote this file with a
 * second SQLite library, which could damage it): salvage every readable row, then
 * rebuild the database from scratch.
 */
async function repairDb(broken: SQLite.SQLiteDatabase | null): Promise<SQLite.SQLiteDatabase> {
  let settingsRows: { key: string; value: string }[] = [];
  let intakeRows: Record<string, unknown>[] = [];
  if (broken) {
    settingsRows = await broken.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings').catch(() => []);
    intakeRows = await broken.getAllAsync<Record<string, unknown>>('SELECT * FROM intake ORDER BY created_at').catch(() => []);
    await broken.closeAsync().catch(() => undefined);
  }
  await SQLite.deleteDatabaseAsync(DB_NAME).catch(() => undefined);
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await migrate(db);
  await db.withTransactionAsync(async () => {
    for (const r of settingsRows) {
      await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', r.key, r.value).catch(() => undefined);
    }
    for (const r of intakeRows) {
      await db
        .runAsync(
          'INSERT INTO intake (amount_ml, goal_ml, created_at, day, source, tag_id) VALUES (?, ?, ?, ?, ?, ?)',
          Number(r.amount_ml),
          Number(r.goal_ml),
          Number(r.created_at),
          String(r.day),
          String(r.source),
          (r.tag_id as string | null) ?? null,
        )
        .catch(() => undefined);
    }
  });
  return db;
}

async function migrate(db: SQLite.SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  if (version < 1) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS intake (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          amount_ml INTEGER NOT NULL CHECK (amount_ml > 0),
          goal_ml INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          day TEXT NOT NULL,
          source TEXT NOT NULL,
          tag_id TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_intake_day ON intake (day);
        CREATE INDEX IF NOT EXISTS idx_intake_created ON intake (created_at);
      `);
    });
    version = 1;
  }

  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export async function loadSettings(): Promise<Settings> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const { key, value } of rows) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    try {
      merged[key] = JSON.parse(value);
    } catch {
      // Ignore a corrupt value and keep the default.
    }
  }
  const s = merged as unknown as Settings;
  return { ...s, reminders: { ...DEFAULT_SETTINGS.reminders, ...s.reminders } };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const entries = Object.entries(patch).filter(([k]) => k in DEFAULT_SETTINGS);
  if (entries.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const [key, value] of entries) {
      await db.runAsync(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        key,
        JSON.stringify(value ?? null),
      );
    }
  });
}

/* ------------------------------------------------------------------ */
/* Intake                                                              */
/* ------------------------------------------------------------------ */

interface IntakeRow {
  id: number;
  amount_ml: number;
  goal_ml: number;
  created_at: number;
  day: string;
  source: IntakeSource;
  tag_id: string | null;
}

const toEntry = (r: IntakeRow): IntakeEntry => ({
  id: r.id,
  amountMl: r.amount_ml,
  goalMl: r.goal_ml,
  createdAt: r.created_at,
  day: r.day,
  source: r.source,
  tagId: r.tag_id,
});

export async function insertIntake(input: {
  amountMl: number;
  goalMl: number;
  source: IntakeSource;
  tagId?: string | null;
  createdAt?: number;
}): Promise<IntakeEntry> {
  const db = await getDb();
  const createdAt = input.createdAt ?? Date.now();
  const day = dayKey(createdAt);
  const res = await db.runAsync(
    'INSERT INTO intake (amount_ml, goal_ml, created_at, day, source, tag_id) VALUES (?, ?, ?, ?, ?, ?)',
    Math.round(input.amountMl),
    Math.round(input.goalMl),
    createdAt,
    day,
    input.source,
    input.tagId ?? null,
  );
  return {
    id: res.lastInsertRowId,
    amountMl: Math.round(input.amountMl),
    goalMl: Math.round(input.goalMl),
    createdAt,
    day,
    source: input.source,
    tagId: input.tagId ?? null,
  };
}

/** Imports a tap logged by the native closed-app logger; skips it if already imported. */
export async function importTap(tap: { at: number; amountMl: number; goalMl: number; tagId: string | null }): Promise<void> {
  const db = await getDb();
  const exists = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM intake WHERE created_at = ? AND source = 'nfc'",
    tap.at,
  );
  if (exists && exists.n > 0) return;
  await insertIntake({ amountMl: tap.amountMl, goalMl: tap.goalMl, source: 'nfc', tagId: tap.tagId, createdAt: tap.at });
}

export async function deleteIntake(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM intake WHERE id = ?', id);
}

export async function getEntriesForDay(day: string): Promise<IntakeEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<IntakeRow>('SELECT * FROM intake WHERE day = ? ORDER BY created_at DESC', day);
  return rows.map(toEntry);
}

/** Timestamp of the most recent sticker-driven log (NFC or Shortcut), for duplicate protection. */
export async function getLastScanAt(): Promise<number | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ t: number | null }>(
    "SELECT MAX(created_at) AS t FROM intake WHERE source IN ('nfc', 'shortcut')",
  );
  return row?.t ?? null;
}

/**
 * Paged per-day summaries, newest first. The goal of a past day is the goal snapshot
 * stored with that day's most recent entry.
 */
export async function getDaySummaries(limit: number, offset = 0): Promise<DaySummary[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ day: string; total: number; count: number; goal: number }>(
    `SELECT i.day AS day,
            SUM(i.amount_ml) AS total,
            COUNT(*) AS count,
            (SELECT g.goal_ml FROM intake g WHERE g.day = i.day ORDER BY g.created_at DESC LIMIT 1) AS goal
       FROM intake i
      GROUP BY i.day
      ORDER BY i.day DESC
      LIMIT ? OFFSET ?`,
    limit,
    offset,
  );
  return rows.map((r) => ({ day: r.day, totalMl: r.total, goalMl: r.goal, count: r.count }));
}

/** All entries whose day falls within [fromDay, toDay] (inclusive), newest first. */
export async function getEntriesBetween(fromDay: string, toDay: string): Promise<IntakeEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<IntakeRow>(
    'SELECT * FROM intake WHERE day >= ? AND day <= ? ORDER BY created_at DESC',
    fromDay,
    toDay,
  );
  return rows.map(toEntry);
}

export async function getTotalsForDays(days: string[]): Promise<Record<string, number>> {
  if (days.length === 0) return {};
  const db = await getDb();
  const placeholders = days.map(() => '?').join(',');
  const rows = await db.getAllAsync<{ day: string; total: number }>(
    `SELECT day, SUM(amount_ml) AS total FROM intake WHERE day IN (${placeholders}) GROUP BY day`,
    ...days,
  );
  return Object.fromEntries(rows.map((r) => [r.day, r.total]));
}

export async function getLifetimeStats(): Promise<{ totalMl: number; days: number; entries: number }> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number | null; days: number; entries: number }>(
    'SELECT SUM(amount_ml) AS total, COUNT(DISTINCT day) AS days, COUNT(*) AS entries FROM intake',
  );
  return { totalMl: row?.total ?? 0, days: row?.days ?? 0, entries: row?.entries ?? 0 };
}

/** Wipes everything (used by "Reset app"). */
export async function eraseAllData(): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM intake; DELETE FROM settings;');
  });
}
