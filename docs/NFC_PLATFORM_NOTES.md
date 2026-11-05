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

**App in the background or closed — nothing is written to the sticker:** an NFC tap can
only start an *Activity*; Android can't deliver a tag to a background service. So
`plugins/withNfcLaunchIntent.js` generates **`NfcTapActivity`**, an invisible, translucent
activity in its own task, excluded from Recents. It registers for:
* `TECH_DISCOVERED` (NFC-A/B/F/V tech lists, `res/xml/hydratap_nfc_tech_filter.xml`), which blank stickers trigger;
* `NDEF_DISCOVERED` with no data (empty-record stickers);
* `NDEF_DISCOVERED` for `hydratap://…` (stickers written by builds 4–6).

It reads the hardware UID from the intent. If it matches the registered sticker, it:
1. writes the drink directly into HydraTap's SQLite database (same schema, 8 s duplicate protection);
2. cancels today's remaining reminders once the goal is reached (deterministic reminder ids);
3. shows a toast ("💧 +250 ml · 1.25 L to go") and a short vibration;
4. finishes in `onCreate`.

Any other tag is ignored silently. HydraTap's UI never opens; it reloads totals, history
and reminders the next time it comes to the front.

Android dispatch order matters: if a sticker holds data that another app handles (for example a
website link → browser), Android sends it there first. Closed-app logging needs a
**blank** sticker. In-app taps (reader mode) work with any sticker. If more than one app
claims blank tags, Android may ask once which app to use; choose HydraTap → *Always*.

**Restoring a sticker:** Settings → Tap check → *Check my sticker* shows what's on it.
Stickers written by earlier builds carry a HydraTap link (still works), which
*Remove HydraTap link from sticker* erases back to blank.

**Screen off / lock screen:**
* With the screen **off**, Android doesn't power the NFC reader at all. No app can change this.
* On the **lock screen**, stickers are only read if the phone allows it. On Android 12+ that's the *Require device unlock for NFC* setting: turn it **off** under Settings → Connected devices → Connection preferences → NFC (Samsung: Connections → NFC). Some phones don't offer it.

### Troubleshooting: Android shows its own "Empty tag" / tag screen

Another app (often the system tag viewer) claimed the sticker first. Choose HydraTap if
Android asks, or check the sticker under Settings → Tap check.

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
