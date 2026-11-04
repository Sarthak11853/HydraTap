# HydraTap 💧

An offline-first water tracker. Tap your phone on the NFC sticker on your bottle and a drink is
logged. It has an animated water bottle, gentle reminders and a full history, all stored locally
in SQLite. There is no account and no backend.

* **Stack:** Expo SDK 58 · React Native 0.88 · TypeScript · Expo Router · `react-native-nfc-manager` 4.2 · `expo-sqlite` · `expo-notifications` · Reanimated 4 + `react-native-svg`
* **Platforms:** Android and iOS from one codebase. NFC requires a **development build**; it can't run in Expo Go.
* **NFC behaviour per platform:** see [`docs/NFC_PLATFORM_NOTES.md`](docs/NFC_PLATFORM_NOTES.md).
* **How it was built, phase by phase:** see [`docs/DEVELOPMENT_PHASES.md`](docs/DEVELOPMENT_PHASES.md).

## Features

* Onboarding: name → daily goal → amount per tap → sticker pairing → reminders
* Registers one NFC sticker by its hardware UID. Other tags are ignored. You can replace or remove it.
* Android: tap while the app is open, or with the app in the background or closed (via an optional launch record written to the sticker)
* iOS: tap **Scan sticker** (system NFC sheet). An optional Shortcuts automation lets a tap open the app and log.
* Duplicate-tap protection (8 s window, serialised writes)
* Animated bottle that fills with your real progress and changes to teal with a glow when you reach the goal
* Today's total, remaining amount and percentage; a history grouped by day with a 7-day chart and all-time stats
* Settings changes never rewrite history: each entry stores its amount and the goal at that moment
* Local reminders with a custom water-drop sound, an interval and a start/end window. Today's reminders are skipped once the goal is reached, or if you drank recently. They are rescheduled automatically.
* Optional manual logging, switched on automatically on devices without NFC

## Install on your phone

The easiest route is a cloud build with EAS. It needs a free Expo account but no Android Studio or Xcode.

**Android** (installs a standalone APK; no computer is needed once it's installed):

```bash
git clone -b Version1 https://github.com/Sarthak11853/HydraTap.git && cd HydraTap
npm install
npx eas-cli@latest login
npx eas-cli@latest build --profile preview --platform android
```

The first build asks to create the EAS project and an Android keystore; answer **Yes** to both.
When the build finishes (about 10–20 min), open the link or scan the QR code on your phone,
download the `.apk`, and allow "Install unknown apps" when prompted.

**iPhone:** NFC tag reading needs a paid Apple Developer Program membership, because free
provisioning can't grant the NFC entitlement. With one:

```bash
npx eas-cli@latest device:create
npx eas-cli@latest build --profile preview --platform ios
```

Register your iPhone with the first command, then install the build from the link.

## Getting started (development)

```bash
npm install
```

Build and install a development build on a **physical device** (NFC doesn't work in simulators):

```bash
npx expo run:android --device
```

```bash
npx expo run:ios --device
```

Or build in the cloud with EAS:

```bash
npx eas-cli@latest build --profile development --platform android
```

Then start the bundler:

```bash
npm start
```

iOS signing: the bundle ID `com.hydratap.app` needs the **NFC Tag Reading** capability in your
Apple Developer account. If you change `ios.bundleIdentifier` / `android.package` in `app.json`,
also update `ANDROID_PACKAGE` in `src/nfc/nfcService.ts`.

### UI preview in a browser

```bash
npm run web
```

Open `http://localhost:8081/?demo` to see sample data. Browsers can't read NFC, so the preview
uses in-memory storage (`*.web.ts` files) and manual logging.

## Scripts

| Command | What it does |
|---|---|
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (`eslint-config-expo`) |
| `npm test` | Unit tests for the domain logic (Node's built-in test runner, no extra deps) |
| `npm run prebuild` | Regenerate `android/` and `ios/` from `app.json` + config plugins |
| `npm run assets` | Regenerate the notification sound and the icon PNGs from source |

## Project layout

```
src/
  app/                    Expo Router screens
    _layout.tsx           providers + onboarding gate (Stack.Protected)
    +native-intent.tsx    maps hydratap:// deep links to Home
    onboarding/           5-step onboarding
    (tabs)/               Home · History · Settings
    sticker.tsx           register / replace sticker (modal)
    ios-shortcut.tsx      iOS Shortcuts automation guide (modal)
  components/             WaterBottle, StickerRegistration, ReminderEditor, ui kit, Toast, icons
  db/database.ts          SQLite schema, migrations, queries (database.web.ts = preview)
  domain/                 pure logic: dates, formatting, tag matching, reminder planning (+ tests)
  nfc/                    nfcService (platform wrapper) and useTapToLog (event wiring)
  notifications/          reminder scheduling
  state/AppStore.tsx      app state, logging and duplicate protection
  theme/                  colours, typography, spacing
plugins/withNfcLaunchIntent.js   Android NDEF_DISCOVERED filter + Recents replay guard
scripts/                  sound and icon generators
assets/                   icon set, splash, notification icon, water_drop.wav
```

## Privacy

All data stays on the device in `hydratap.db`. The app makes no network requests.
