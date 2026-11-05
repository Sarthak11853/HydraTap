/**
 * Parses HydraTap deep links without relying on a URL polyfill:
 *  - `hydratap://log?key=<secret>[&t=<nonce>]` (sticker link / iOS Shortcut)
 *  - `hydratap://nfc[?t=<nonce>]` (old sticker link from early builds)
 * `t` is stamped by MainActivity on every NFC launch.
 */
export type HydraTapLink =
  | { kind: 'log'; key: string | null; nonce: string | null }
  | { kind: 'old'; nonce: string | null }
  | null;

export function parseHydraTapLink(url: string | null | undefined): HydraTapLink {
  if (!url) return null;
  const m = /^hydratap:\/\/\/?([^/?#]*)[^?#]*(?:\?([^#]*))?/i.exec(url.trim());
  if (!m) return null;
  const host = m[1].toLowerCase();
  const params: Record<string, string> = {};
  for (const pair of (m[2] ?? '').split('&')) {
    if (!pair) continue;
    const [k, v = ''] = pair.split('=');
    try {
      params[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
    } catch {
      params[k] = v;
    }
  }
  const nonce = params.t || null;
  if (host === 'nfc') return { kind: 'old', nonce };
  if (host === 'log') return { kind: 'log', key: params.key || null, nonce };
  return null;
}
