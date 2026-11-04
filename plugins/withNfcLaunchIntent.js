/**
 * Expo config plugin: lets Android launch HydraTap when the registered sticker
 * is tapped while the app is in the background or closed.
 *
 * During registration (Android only, optional) HydraTap writes an NDEF message
 * to the sticker containing:
 *   1. A URI record `hydratap://nfc`
 *   2. An Android Application Record (AAR) for this package
 *
 * Android's tag dispatch system then delivers an `NDEF_DISCOVERED` intent with
 * the tag (including its UID) to MainActivity. The JS side reads it with
 * `NfcManager.getBackgroundTag()` and only logs water if the UID matches the
 * registered sticker. No background service or polling is involved — this is
 * the official, event-driven Android mechanism.
 *
 * `expo.android.intentFilters` cannot express NFC actions (it always prefixes
 * `android.intent.action.`), hence this tiny plugin.
 */
const { withAndroidManifest, withMainActivity, AndroidConfig } = require('expo/config-plugins');

const MARKER = 'hydratap-nfc';

const GUARD_MARKER = '// HydraTap: ignore replayed NFC launch';
const GUARD = `
    ${GUARD_MARKER}
    // Reopening the app from Recents re-delivers the original launch intent. If that
    // was a sticker tap it must not be logged again, so drop the stale NFC intent.
    if (((intent?.flags ?: 0) and android.content.Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0 &&
        intent?.action == android.nfc.NfcAdapter.ACTION_NDEF_DISCOVERED) {
      intent = android.content.Intent(android.content.Intent.ACTION_MAIN)
    }`;

function withReplayGuard(config) {
  return withMainActivity(config, (cfg) => {
    const { language, contents } = cfg.modResults;
    if (language !== 'kt' || contents.includes(GUARD_MARKER)) return cfg;
    const re = /override fun onCreate\(savedInstanceState: Bundle\?\) \{/;
    if (!re.test(contents)) {
      throw new Error('[withNfcLaunchIntent] Could not find MainActivity.onCreate to add the NFC replay guard.');
    }
    cfg.modResults.contents = contents.replace(re, (m) => m + GUARD);
    return cfg;
  });
}

function withNfcLaunchIntent(config) {
  config = withReplayGuard(config);
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
    const filters = (activity['intent-filter'] ?? []).filter(
      (f) => f.$?.['data-generated-by'] !== MARKER,
    );

    filters.push({
      $: { 'data-generated-by': MARKER },
      action: [{ $: { 'android:name': 'android.nfc.action.NDEF_DISCOVERED' } }],
      category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      data: [{ $: { 'android:scheme': 'hydratap', 'android:host': 'nfc' } }],
    });
    activity['intent-filter'] = filters;

    // NFC hardware is optional: the app still works (manual logging) without it.
    manifest.manifest['uses-feature'] = (manifest.manifest['uses-feature'] ?? []).filter(
      (f) => f.$?.['android:name'] !== 'android.hardware.nfc',
    );
    manifest.manifest['uses-feature'].push({
      $: { 'android:name': 'android.hardware.nfc', 'android:required': 'false' },
    });
    return cfg;
  });
}

module.exports = withNfcLaunchIntent;
