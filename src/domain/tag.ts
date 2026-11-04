/**
 * Normalises a tag identifier reported by react-native-nfc-manager
 * (hex string on both Android and iOS) to upper-case hex without separators.
 * Returns null for missing / all-zero identifiers, which cannot identify a sticker.
 */
export function normalizeTagId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const hex = raw.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (hex.length < 4 || /^0+$/.test(hex)) return null;
  return hex;
}

/** `04:A2:…:E6:80` – short, human friendly representation of a UID. */
export function maskTagId(uid: string): string {
  const pairs = uid.match(/.{1,2}/g) ?? [];
  if (pairs.length <= 4) return pairs.join(':');
  return `${pairs.slice(0, 2).join(':')}:…:${pairs.slice(-2).join(':')}`;
}

export function isSameTag(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeTagId(a);
  const nb = normalizeTagId(b);
  return na !== null && na === nb;
}

/** True when a new tap arrives within the cooldown window of the previous logged tap. */
export function isDuplicateScan(lastScanAt: number | null, now: number, cooldownMs: number): boolean {
  if (lastScanAt === null) return false;
  const delta = now - lastScanAt;
  return delta >= 0 && delta < cooldownMs;
}

/** Random 24-char hex key (not security critical; guards the Shortcuts deep link). */
export function generateKey(random: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < 24; i++) out += Math.floor(random() * 16).toString(16);
  return out;
}
