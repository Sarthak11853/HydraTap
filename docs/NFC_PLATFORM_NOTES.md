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

* **Foreground:** `NfcManager.registerTagEvent({ isReaderModeEnabled: true, … })`.
  The native module turns reader mode on in `onResume` and off in `onPause`. Tags arrive as
  events, so JS never polls.
* **Background or closed:** during registration, HydraTap can (optionally) write this NDEF
  message to the sticker:
  1. URI record `hydratap://nfc`
  2. Android Application Record `com.hydratap.app`

  `plugins/withNfcLaunchIntent.js` adds an `NDEF_DISCOVERED` intent filter for
  `hydratap://nfc`. Android's tag dispatch then starts (or resumes) `MainActivity` with the tag
  in the intent. JS reads it with `NfcManager.getBackgroundTag()` (cold start) or the
  `DiscoverBackgroundTag` / `DiscoverTag` event (resume). The **UID is still checked**, so a copy
  of the NDEF message on another tag will not log water.
* Writing replaces the sticker's existing content. Read-only stickers still work while the app
  is open. The registration screen explains this, and it can be switched off.
* `android.hardware.nfc` is declared `required="false"` so the app installs on phones without
  NFC, which fall back to manual logging.
* Lock screen: AOSP dispatch normally requires an unlocked device. Some OEMs and Android
  versions add a setting for NFC on the lock screen, but third-party apps can't control it.

### Troubleshooting: Android shows an "Empty tag" screen when HydraTap is closed

The sticker doesn't contain the HydraTap launch link, so Android has nothing to open and
falls back to its built-in tag viewer. Fix: **Settings → NFC sticker → "Logs only while app is
open"** (or the button on Home), then hold the phone still on the sticker for about 2 s. HydraTap
writes the link, reads it back to confirm, and from then on a tap opens the app and logs.

Before this fix, reader mode used `FLAG_READER_SKIP_NDEF_CHECK`. That hid the tag's Ndef
technology, so a sticker registered or replaced from inside the app was never written. Now
removed.

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
