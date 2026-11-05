/**
 * Expo config plugin: lets Android open HydraTap from the registered sticker while
 * the app is in the background or closed.
 *
 * HydraTap writes this NDEF message onto the sticker:
 *   1. URI record `hydratap://log?key=<secret>`
 *   2. Android Application Record (AAR) for this package
 *
 * Android's tag dispatch then starts MainActivity with an `NDEF_DISCOVERED` intent
 * whose data is that link. React Native's Linking exposes it to JS on cold start
 * (getInitialURL) and on resume ('url' event); JS checks the key and logs the drink.
 * No background service and no polling are involved.
 *
 * MainActivity additions (Kotlin):
 *  - Stamps every NFC launch with a unique `t` query parameter, so JS handles each
 *    tap exactly once, even if the activity is recreated.
 *  - Drops the intent when the app is reopened from Recents, which re-delivers the
 *    original launch intent and would otherwise log an old tap again.
 *  - Shows HydraTap over the lock screen for that tap (setShowWhenLocked). Android only
 *    reads stickers on the lock screen if "Require device unlock for NFC" is off.
 *
 * `expo.android.intentFilters` can't express NFC actions (it always prefixes
 * `android.intent.action.`), hence this plugin.
 */
const { withAndroidManifest, withMainActivity, AndroidConfig } = require('expo/config-plugins');

const FILTER_MARKER = 'hydratap-nfc';
const CODE_MARKER = '// HydraTap NFC launch handling';

const ON_CREATE_CALL = `
    ${CODE_MARKER}
    intent = hydraTapPrepareNfcIntent(
      intent,
      ((intent?.flags ?: 0) and android.content.Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0,
    )`;

const MEMBERS = `
  ${CODE_MARKER}
  private fun hydraTapPrepareNfcIntent(source: android.content.Intent?, fromHistory: Boolean): android.content.Intent? {
    if (source?.action != android.nfc.NfcAdapter.ACTION_NDEF_DISCOVERED) return source
    // Reopened from Recents: that sticker tap was already handled.
    if (fromHistory) return android.content.Intent(android.content.Intent.ACTION_MAIN)
    // Unique nonce per tap so JS logs each tap exactly once.
    source.data = source.data?.buildUpon()
      ?.appendQueryParameter("t", System.currentTimeMillis().toString())
      ?.build()
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O_MR1) setShowWhenLocked(true)
    return source
  }

  override fun onNewIntent(intent: android.content.Intent) {
    super.onNewIntent(hydraTapPrepareNfcIntent(intent, false) ?: intent)
  }

  override fun onStop() {
    super.onStop()
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O_MR1) setShowWhenLocked(false)
  }
`;

function withMainActivityNfc(config) {
  return withMainActivity(config, (cfg) => {
    const { language, contents } = cfg.modResults;
    if (language !== 'kt' || contents.includes(CODE_MARKER)) return cfg;
    if (/override fun onNewIntent|override fun onStop/.test(contents)) {
      throw new Error('[withNfcLaunchIntent] MainActivity already overrides onNewIntent/onStop; merge manually.');
    }
    const onCreate = /override fun onCreate\(savedInstanceState: Bundle\?\) \{/;
    if (!onCreate.test(contents)) {
      throw new Error('[withNfcLaunchIntent] Could not find MainActivity.onCreate.');
    }
    let next = contents.replace(onCreate, (m) => m + ON_CREATE_CALL);
    const lastBrace = next.lastIndexOf('}');
    next = next.slice(0, lastBrace) + MEMBERS + next.slice(lastBrace);
    cfg.modResults.contents = next;
    return cfg;
  });
}

function withNfcIntentFilter(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
    const filters = (activity['intent-filter'] ?? []).filter((f) => f.$?.['data-generated-by'] !== FILTER_MARKER);
    filters.push({
      $: { 'data-generated-by': FILTER_MARKER },
      action: [{ $: { 'android:name': 'android.nfc.action.NDEF_DISCOVERED' } }],
      category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      data: [
        { $: { 'android:scheme': 'hydratap', 'android:host': 'log' } },
        // Stickers written by early builds; HydraTap asks the user to rewrite them.
        { $: { 'android:scheme': 'hydratap', 'android:host': 'nfc' } },
      ],
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

module.exports = (config) => withNfcIntentFilter(withMainActivityNfc(config));
