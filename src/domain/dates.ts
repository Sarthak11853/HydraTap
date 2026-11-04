const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day key `YYYY-MM-DD` for a timestamp. */
export function dayKey(ts: number | Date = Date.now()): string {
  const d = typeof ts === 'number' ? new Date(ts) : ts;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses a `YYYY-MM-DD` key into a local Date at midnight. */
export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function startOfDay(ts: number | Date = Date.now()): Date {
  const d = new Date(typeof ts === 'number' ? ts : ts.getTime());
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

export function msUntilNextMidnight(now: number = Date.now()): number {
  return addDays(startOfDay(now), 1).getTime() - now;
}

export function greetingFor(date: Date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** `9:05 AM`-style label for minutes after midnight, honouring 12/24h preference. */
export function formatMinutes(min: number, use24h = false): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  if (use24h) return `${pad(h)}:${pad(m)}`;
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${suffix}`;
}

export function formatClock(ts: number): string {
  const d = new Date(ts);
  return formatMinutes(d.getHours() * 60 + d.getMinutes());
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** `Wednesday, 4 November` */
export function formatLongDate(date: Date = new Date()): string {
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** `Today`, `Yesterday` or `Mon, 2 Nov` (with year if not current). */
export function formatDayLabel(key: string, now: Date = new Date()): string {
  const today = dayKey(now);
  if (key === today) return 'Today';
  if (key === dayKey(addDays(startOfDay(now), -1))) return 'Yesterday';
  const d = parseDayKey(key);
  const base = `${WEEKDAYS[d.getDay()].slice(0, 3)}, ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

export function shortWeekday(key: string): string {
  return WEEKDAYS[parseDayKey(key).getDay()].slice(0, 1);
}
