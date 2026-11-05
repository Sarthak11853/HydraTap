# NFC on Android and iOS: what HydraTap can and can't do

HydraTap identifies your sticker by its **hardware UID**. It only logs water when that UID
matches the sticker you registered. Every other tag is ignored. Below is what each platform
officially allows, and how HydraTap uses it. Nothing here is faked: where a platform doesn't
allow something, the app says so.

## Summary

| Situation | Android | iOS |
|---|---|---|
| App open, foreground | ✅ Automatic. Reader mode is on while HydraTap is open; just tap. | ✅ Tap **Scan sticker** to open the system NFC sheet, then hold the phone near the sticker. iOS requires a user-started session. |
| App in background | ✅ If the launch record was written to the sticker, Android brings HydraTap to the front and logs. | ⚠️ No direct read. Optional **Shortcuts automation** (see below). |
| App closed (killed) | ✅ Same as background: Android launches HydraTap via `NDEF_DISCOVERED`, and the tag UID is verified. | ⚠️ Shortcuts automation only. |
| Screen locked | ❌ On most devices Android only dispatches tags while the screen is on **and unlocked**. With the screen off, the NFC controller doesn't poll. | ❌ for in-app reads. iOS Background Tag Reading asks the user to unlock first. Shortcuts NFC automations generally run only when the iPhone is unlocked. |
| Read the sticker UID | ✅ Always available. | ✅ Only inside an `NFCTagReaderSession` (`requestTechnology` with MIFARE / ISO 15693 / ISO 7816). The NDEF session does **not** expose the UID. |

## Android details

**App open:** `NfcManager.registerTagEvent({ isReaderModeEnabled: true, … SKIP_NDEF_CHECK })`.
Reader mode is on only while HydraTap is in front (the native module toggles it on
resume/pause). Every tap arrives as an event with the hardware UID, which must match the
registered sticker.

**One reader mode for everything:** in-app logging, registration (the UID of a single quick
tap) and writing/checking the link all run in reader mode with `SKIP_NDEF_CHECK`. On the
test phone this was the only mode that worked reliably: a build without the flag stopped
in-app taps, and a build using tag dispatch for registration hung on "Ready to scan". The
link is written with raw NFC Forum Type 2 commands (`src/nfc/type2.ts`: READ 0x30 /
WRITE 0xA2, capability container, NDEF TLV), unit-tested against a simulated NTAG213.
Supported stickers: NTAG213/215/216 and MIFARE Ultralight (the common NFC stickers).

**App in the background or closed:** HydraTap writes this NDEF message onto the sticker
(Settings → NFC sticker, or the button on Home):

1. URI record `hydratap://log?key=<secret>`. The secret is generated per install and stored only in the app and on the sticker.
2. Android Application Record `com.hydratap.app`.

`plugins/withNfcLaunchIntent.js` adds an `NDEF_DISCOVERED` intent filter for
`hydratap://log`. When you tap, Android's tag dispatch opens `MainActivity` with that link,
and React Native's own `Linking` delivers it to JS:
* `getInitialURL()` on a cold start;
* the `url` event when the app was in the background.

React Native explicitly supports `NDEF_DISCOVERED` here. JS checks the key and logs the drink.

`MainActivity` (patched by the plugin):
* stamps every NFC launch with a unique `t` parameter, so each tap is handled exactly once, even if the activity is recreated;
* drops the intent when the app is reopened from Recents, so an old tap isn't replayed;
* calls `setShowWhenLocked(true)` for that tap, so the confirmation can appear over the lock screen on phones that read NFC while locked.

**Screen off / lock screen:**
* With the screen **off**, Android doesn't power the NFC reader at all. No app can change this.
* On the **lock screen**, stickers are only read if the phone allows it. On Android 12+ that's the *Require device unlock for NFC* setting: turn it **off** under Settings → Connected devices → Connection preferences → NFC (Samsung: Connections → NFC). Some phones don't offer it.

### Troubleshooting: Android shows an "Empty tag" screen

The sticker doesn't hold the HydraTap link, so Android falls back to its own tag viewer.
1. Open **Settings → Tap check → Check my sticker** to confirm.
2. Then tap **Write the link now** (or *Enable tapping when the app is closed* on Home) then tap the sticker once. The link is read back after writing to confirm it.

Stickers written by builds 1–3 carry an old link without a key. HydraTap shows "Update your
sticker" for those; rewrite them once.

## iOS details

* **Entitlement** `com.apple.developer.nfc.readersession.formats` with `TAG` and `NDEF`, and
  `NFCReaderUsageDescription`. Both are added by the `react-native-nfc-manager` config plugin.
  Your Apple Developer account must have the **NFC Tag Reading** capability for the bundle ID.
* `com.apple.developer.nfc.readersession.iso7816.select-identifiers` contains the NFC Forum
  Type 4 AID (`D2760000850101`), which polling ISO 7816 tags requires.
* **Foreground reads** use `requestTechnology([MifareIOS, Iso15693IOS, IsoDep])`, then
  `getTag({ readNdef: false })` to get `tag.id`. The result ("+250 ml logged" or "Not your
  HydraTap sticker") is shown in the system sheet.
* **Background Tag Reading** (iPhone XS and later) only works with NDEF **Universal Links**.
  Custom URL schemes are not supported, the UID is never provided, and it requires an
  Associated Domain plus a hosted `apple-app-site-association` file. HydraTap has no server,
  so this isn't used.
* **Shortcuts automation (optional):** the Shortcuts app's *NFC* personal automation recognises
  a specific tag on its own and can run "Open URLs" → `hydratap://log?key=<secret>`. HydraTap
  logs a drink when the key matches. This is Apple's official feature. The tag matching happens
  inside Shortcuts, so HydraTap can't re-verify the UID; the private key stops other links from
  adding water. iOS may show a banner when it runs, and it normally requires an unlocked iPhone.

## Duplicate protection

* All writes go through one serialised queue (`AppStore.withLock`).
* A sticker-based log (NFC or Shortcut) within **8 s** of the previous one is ignored and
  reported as "Already logged". The timestamp comes from SQLite, so it also covers a cold start
  that receives both the launch tag and an event.
* While a registration read is in progress, foreground tap events are not logged.

## Recommended stickers

NTAG213/215/216 (ISO 14443-A, NFC Forum Type 2) stickers work on both platforms and can be
written. Stickers designed for metal surfaces read better on metal bottles.

## Sources

* Apple: [Adding support for background tag reading](https://developer.apple.com/documentation/corenfc/adding-support-for-background-tag-reading)
* Apple Shortcuts User Guide: [Personal automation triggers](https://support.apple.com/guide/shortcuts/apd602971e63/ios)
* Android: [NFC basics: tag dispatch system](https://developer.android.com/develop/connectivity/nfc/nfc)
* `react-native-nfc-manager` 4.2 source (`NfcManager.java`, `RNNfcManager.swift`)
