/**
 * HydraTap deep links (`hydratap://log?key=…` from the iOS Shortcuts automation and
 * `hydratap://nfc` written on Android stickers) are handled by useStickerTapLogging,
 * not by a route. Send the router to Home so it never shows "Unmatched route".
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const bare = path.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^\/+/, '');
    if (/^(log|nfc)(\/|\?|$)/i.test(bare)) return '/';
    return path;
  } catch {
    return '/';
  }
}
