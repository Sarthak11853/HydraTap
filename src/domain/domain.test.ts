/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dayKey, formatMinutes, formatDayLabel, msUntilNextMidnight } from './dates.ts';
import { parseHydraTapLink } from './link.ts';
import { formatVolume, progressPercent, remainingMl, snap } from './format.ts';
import { normalizeTagId, isSameTag, isDuplicateScan, maskTagId, generateKey } from './tag.ts';
import { planReminders, reminderSlots, MAX_PENDING_REMINDERS } from './reminders.ts';
import type { ReminderSettings } from './types.ts';

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

test('dayKey uses the local calendar day', () => {
  assert.equal(dayKey(at(2026, 1, 5, 23, 59)), '2026-01-05');
  assert.equal(dayKey(at(2026, 12, 31, 0, 0)), '2026-12-31');
});

test('formatMinutes 12h and 24h', () => {
  assert.equal(formatMinutes(9 * 60 + 5), '9:05 AM');
  assert.equal(formatMinutes(0), '12:00 AM');
  assert.equal(formatMinutes(12 * 60 + 30), '12:30 PM');
  assert.equal(formatMinutes(21 * 60, true), '21:00');
});

test('formatDayLabel', () => {
  const now = new Date(2026, 10, 4, 10);
  assert.equal(formatDayLabel('2026-11-04', now), 'Today');
  assert.equal(formatDayLabel('2026-11-03', now), 'Yesterday');
  assert.equal(formatDayLabel('2026-11-01', now), 'Sun, 1 Nov');
  assert.equal(formatDayLabel('2025-11-01', now), 'Sat, 1 Nov 2025');
});

test('msUntilNextMidnight', () => {
  assert.equal(msUntilNextMidnight(at(2026, 3, 1, 23, 0)), 3600_000);
});

test('volume formatting and progress', () => {
  assert.equal(formatVolume(250), '250 ml');
  assert.equal(formatVolume(1000), '1 L');
  assert.equal(formatVolume(1250), '1.25 L');
  assert.equal(formatVolume(2500), '2.5 L');
  assert.equal(progressPercent(750, 2000), 38);
  assert.equal(progressPercent(3000, 2000), 150);
  assert.equal(remainingMl(3000, 2000), 0);
  assert.equal(remainingMl(500, 2000), 1500);
  assert.equal(snap(263, 25, 25, 2000), 275);
  assert.equal(snap(9000, 100, 500, 6000), 6000);
});

test('tag id normalisation and matching', () => {
  assert.equal(normalizeTagId('04:a2:b3:c4:d5:e6:80'), '04A2B3C4D5E680');
  assert.equal(normalizeTagId('04a2b3c4d5e680'), '04A2B3C4D5E680');
  assert.equal(normalizeTagId('00000000'), null);
  assert.equal(normalizeTagId(''), null);
  assert.equal(normalizeTagId(undefined), null);
  assert.ok(isSameTag('04a2b3c4d5e680', '04:A2:B3:C4:D5:E6:80'));
  assert.ok(!isSameTag('04a2b3c4d5e680', '04a2b3c4d5e681'));
  assert.ok(!isSameTag(null, null));
  assert.equal(maskTagId('04A2B3C4D5E680'), '04:A2:…:E6:80');
});

test('duplicate scan detection', () => {
  assert.ok(!isDuplicateScan(null, 1000, 8000));
  assert.ok(isDuplicateScan(1000, 5000, 8000));
  assert.ok(!isDuplicateScan(1000, 9000, 8000));
  // Clock moved backwards: do not block forever.
  assert.ok(!isDuplicateScan(10_000, 5000, 8000));
});

test('generateKey', () => {
  const k = generateKey();
  assert.match(k, /^[0-9a-f]{24}$/);
});

const base: ReminderSettings = { enabled: true, intervalMin: 60, startMin: 9 * 60, endMin: 21 * 60 };

test('reminderSlots', () => {
  assert.equal(reminderSlots(base).length, 13);
  assert.deepEqual(reminderSlots({ intervalMin: 90, startMin: 600, endMin: 780 }), [600, 690, 780]);
  assert.deepEqual(reminderSlots({ intervalMin: 60, startMin: 700, endMin: 600 }), []);
});

test('planReminders disabled returns nothing', () => {
  assert.equal(planReminders({ now: at(2026, 11, 4, 8), settings: { ...base, enabled: false }, todayTotalMl: 0, goalMl: 2000, lastIntakeAt: null }).length, 0);
});

test('planReminders skips past slots and respects budget', () => {
  const now = at(2026, 11, 4, 14, 10);
  const plan = planReminders({ now, settings: base, todayTotalMl: 500, goalMl: 2000, lastIntakeAt: null });
  assert.ok(plan.length <= MAX_PENDING_REMINDERS);
  assert.equal(plan[0].at, at(2026, 11, 4, 15, 0));
  assert.ok(plan[0].isToday);
  assert.ok(plan.every((p) => p.at > now));
  const todayCount = plan.filter((p) => p.isToday).length;
  assert.equal(todayCount, 7); // 15:00 … 21:00
  // strictly increasing
  for (let i = 1; i < plan.length; i++) assert.ok(plan[i].at > plan[i - 1].at);
});

test('planReminders skips today once goal is reached', () => {
  const now = at(2026, 11, 4, 10);
  const plan = planReminders({ now, settings: base, todayTotalMl: 2000, goalMl: 2000, lastIntakeAt: now });
  assert.ok(plan.length > 0);
  assert.ok(plan.every((p) => !p.isToday));
  assert.equal(plan[0].at, at(2026, 11, 5, 9, 0));
});

test('planReminders avoids a reminder right after a drink', () => {
  const now = at(2026, 11, 4, 10, 20);
  const plan = planReminders({ now, settings: base, todayTotalMl: 250, goalMl: 2000, lastIntakeAt: at(2026, 11, 4, 10, 15) });
  // 11:00 is only 45 min after the drink -> skipped; 12:00 is next.
  assert.equal(plan[0].at, at(2026, 11, 4, 12, 0));
});

test('planReminders with 30 minute interval stays within budget', () => {
  const s = { ...base, intervalMin: 30, startMin: 0, endMin: 23 * 60 + 30 };
  const plan = planReminders({ now: at(2026, 11, 4, 0, 5), settings: s, todayTotalMl: 0, goalMl: 2000, lastIntakeAt: null });
  assert.equal(plan.length, MAX_PENDING_REMINDERS);
});


test('parseHydraTapLink', () => {
  assert.deepEqual(parseHydraTapLink('hydratap://log?key=abc123'), { kind: 'log', key: 'abc123', nonce: null });
  assert.deepEqual(parseHydraTapLink('hydratap://log?key=abc123&t=1730000000000'), { kind: 'log', key: 'abc123', nonce: '1730000000000' });
  assert.deepEqual(parseHydraTapLink('hydratap://nfc?t=5'), { kind: 'old', nonce: '5' });
  assert.deepEqual(parseHydraTapLink('hydratap://nfc'), { kind: 'old', nonce: null });
  assert.deepEqual(parseHydraTapLink('hydratap://log'), { kind: 'log', key: null, nonce: null });
  assert.equal(parseHydraTapLink('hydratap://settings'), null);
  assert.equal(parseHydraTapLink('https://example.com/log?key=x'), null);
  assert.equal(parseHydraTapLink(null), null);
});
