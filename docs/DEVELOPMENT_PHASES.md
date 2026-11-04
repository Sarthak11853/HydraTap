# Development phases

HydraTap was built in the nine phases requested. For each phase: what was implemented, the
files involved, and how to test it on a device.

> **Before testing anything:** install a development build on a physical phone
> (`npx expo run:android --device` / `npx expo run:ios --device`, or
> `eas build --profile development`) and run `npm start`. Expo Go and simulators can't use NFC.
> To reset between tests, use Settings → *Erase all data*.

---

## Phase 1: Project setup and UI foundation

**Implemented**
* Expo SDK 58 + TypeScript (strict), with Expo Router routes in `src/app`.
* Dependencies: router, SQLite, notifications, NFC manager, Reanimated, SVG, haptics, dev client. Icons are custom SVGs, so there is no icon-font dependency.
* App config: `hydratap://` scheme, bundle IDs, the NFC config plugin (NDEF + TAG entitlement, ISO 7816 AID, usage text), the notification plugin with a custom sound and remote push disabled, exact-alarm permissions blocked, splash screen.
* Theme (light blue / white / cyan), UI kit (Card, Button, Chips, Stepper, Row, Toggle, bottom Sheet), toasts, and tab navigation (Home · History · Settings).

**Files:** `package.json`, `app.json`, `eas.json`, `tsconfig.json`, `eslint.config.js`, `src/theme/index.ts`, `src/components/{ui,Icon,Toast,ModalHeader}.tsx`, `src/app/_layout.tsx`, `src/app/(tabs)/_layout.tsx`

**Test:** `npm run typecheck && npm run lint`. Launch the app and switch between the three tabs.

---

## Phase 2: User onboarding

**Implemented**
* A five-step flow: name → daily goal (presets + stepper, 0.5–6 L) → amount per tap (25 ml–2 L, with an "≈ N taps" hint) → sticker → reminders.
* Each step saves immediately. `onboarded` is set at the end. `Stack.Protected` keeps onboarding and the main app mutually exclusive.
* The dashboard greets the user by name.

**Files:** `src/app/onboarding/*`, `src/components/OnboardingFrame.tsx`

**Test:** fresh install → complete the steps → the Home screen shows "Good morning, <name>" and your goal. Kill and reopen the app: onboarding does not show again.

---

## Phase 3: NFC registration and identification

**Implemented** (see `NFC_PLATFORM_NOTES.md` for the platform research)
* `readTag()`:
  * iOS: `NFCTagReaderSession` via `requestTechnology([MifareIOS, Iso15693IOS, IsoDep])`, then `getTag()` to read the UID. The result appears in the system sheet.
  * Android: `requestTechnology`, with an optional NDEF write of the launch record (`hydratap://nfc` + AAR).
* UIDs are normalised to upper-case hex. All-zero or missing IDs are rejected.
* Register, replace and remove, each with a success confirmation and the masked UID.
* While a registration read is running, foreground tap events are ignored.

**Files:** `src/nfc/nfcService.ts`, `src/components/StickerRegistration.tsx`, `src/app/sticker.tsx`, `src/domain/tag.ts`, `plugins/withNfcLaunchIntent.js`

**Test:**
1. Register a sticker. You should see "Sticker registered!" and an ID.
2. Settings → NFC sticker → *Replace* with another sticker. You should see "Sticker replaced!".
3. Tap the old sticker. You should see "Not your HydraTap sticker" and nothing is logged.
4. *Remove*. Taps now show "No sticker registered".

---

## Phase 4: Water logging and SQLite storage

**Implemented**
* SQLite with WAL mode and `PRAGMA user_version` migrations.
  * `settings(key, value JSON)`
  * `intake(id, amount_ml, goal_ml, created_at, day, source, tag_id)`, indexed on `day` and `created_at`
* Every entry snapshots its amount **and the goal at that time**, so changing settings never rewrites history.
* All writes go through a serialised lock. Sticker taps within 8 s of the last one are ignored as duplicates; the last timestamp is read from SQLite, so this also works across app restarts.

**Files:** `src/db/database.ts`, `src/state/AppStore.tsx`, `src/domain/types.ts`

**Test:** tap the sticker → "+250 ml logged" toast and the totals update. Tap again immediately → "Already logged". Change the amount per tap to 500 ml → new taps add 500 ml, and older entries still show 250 ml in History.

---

## Phase 5: Animated dashboard

**Implemented**
* `WaterBottle`: an SVG bottle with a clip path and two animated sine waves. The waves are worklet-generated paths on the UI thread.
  * The fill level springs to the real progress.
  * Rising bubbles and level ticks.
  * When the goal is reached, the water turns teal and the bottle glows.
* The wave animation pauses when the tab isn't focused or the app is in the background, and respects *Reduce Motion*.
* Home shows the greeting, date, bottle with %, consumed / goal, remaining (with taps left), progress, a context action card, and today's sips.

**Files:** `src/components/WaterBottle.tsx`, `src/app/(tabs)/index.tsx`

**Test:** log several drinks and watch the level rise. Reach the goal and you should see a teal bottle, the "Daily goal achieved" banner and a celebration toast. Browser preview: `npm run web`, then open `/?demo`.

---

## Phase 6: History

**Implemented**
* Days are paged 14 at a time with `SectionList` lazy loading.
* Each day shows its total against that day's goal snapshot (today uses the current goal), with a progress bar and a ✓ when met.
* Each entry shows time, amount and source (sticker, shortcut or manual). Long-press removes a mistaken entry, after a confirmation.
* A 7-day bar chart with the daily average, goals met, and all-time totals.

**Files:** `src/app/(tabs)/history.tsx`, `src/components/sources.ts`

**Test:** log on several days (or use `/?demo` on web). Scroll to load older days. Long-press an entry → confirm → totals update.

---

## Phase 7: Reminders and notifications

**Implemented**
* Settings: enable/disable, interval (30 min–3 h), and a start/end window.
* Notifications are scheduled as OS-managed one-shot notifications in a **rolling window**: up to 60 pending (iOS allows 64) across at most 7 days. They fire with the app closed; no background task is needed.
* Today's reminders are skipped once the goal is met, and any reminder closer than one interval to your last drink is skipped too.
* The window is re-planned whenever you log, change settings, open the app, or a new day starts.
* A custom `water_drop.wav` sound (synthesised by `scripts/generate-sound.mjs`) plays on iOS and on the Android channel `hydration-reminders-v1`.
* *Send a test reminder* button.

**Files:** `src/notifications/reminders.ts`, `src/domain/reminders.ts`, `src/components/ReminderEditor.tsx`, `assets/sounds/water_drop.wav`

**Test:**
* Enable reminders → *Send a test reminder* → lock the phone; you should get a notification with the water-drop sound within about 3 s.
* Set a 30-minute interval that starts now, close the app, and wait.
* Reach your goal: no more reminders today.

---

## Phase 8: Background NFC

**Implemented**
* **Android:** an `NDEF_DISCOVERED` intent filter for `hydratap://nfc`. If HydraTap is closed or in the background, tapping the sticker (with the launch record) opens it. The UID is read with `getBackgroundTag()` / `DiscoverBackgroundTag`, verified, and logged.
  * A `MainActivity` guard drops a stale NFC intent when the app is reopened from Recents, so it isn't logged twice.
* **iOS:** an optional Shortcuts NFC automation opens `hydratap://log?key=<secret>`. The settings screen includes a guide and a share link.
  * Background Tag Reading is not used: it only supports Universal Links and never exposes the UID.
* Deep links are routed to Home via `+native-intent.tsx`.
* **Locked screen:** not supported on either platform for third-party tag reading (see the notes).

**Files:** `plugins/withNfcLaunchIntent.js`, `src/nfc/useTapToLog.ts`, `src/app/+native-intent.tsx`, `src/app/ios-shortcut.tsx`

**Test (Android):**
* Register with "Log even when the app is closed" on → swipe HydraTap away → unlock → tap the sticker. HydraTap opens and shows "+250 ml logged".
* Reopen it from Recents: nothing new is logged.

**Test (iOS):**
* Follow Settings → *Tap without opening the app*.
* With the iPhone unlocked, tap the sticker. HydraTap opens and logs.
* Open `hydratap://log?key=wrong` in Safari: you get "Shortcut link not recognised".

---

## Phase 9: Testing and optimisation

**Implemented**
* Unit tests (`npm test`, Node's built-in runner) for dates, formatting, tag normalisation and matching, duplicate detection, and reminder planning, including the budget, goal-reached and recent-drink rules.
* `tsc` strict and ESLint are clean. `expo prebuild` output was checked (manifest, entitlements, Info.plist, sound bundling). Android and iOS bundles export successfully.
* Performance:
  * No polling anywhere: NFC is OS-event driven and reminders are OS-scheduled.
  * Animations run on the UI thread and pause off-screen.
  * Paged history queries with indexes.
  * A single debounced reminder sync.
  * One midnight timer for day rollover.
  * Minimal dependencies and no network requests.
* A web UI preview with in-memory data (`*.web.ts`) for quick visual checks.

**Files:** `src/domain/domain.test.ts`, `src/db/database.web.ts`, `src/nfc/nfcService.web.ts`

**Test:** `npm run typecheck && npm run lint && npm test`

### Manual QA checklist (on device)
- [ ] Onboarding completes; name and goal persist after a restart
- [ ] Registered sticker logs; any other tag is ignored
- [ ] A double tap within 8 s logs once
- [ ] Android: closed-app tap logs once; reopening from Recents doesn't log again
- [ ] iOS: the scan sheet shows "+250 ml logged" / "Not your HydraTap sticker"
- [ ] The bottle fills and turns teal at 100 %
- [ ] History shows past days with their original goal after the goal is changed
- [ ] Reminders arrive with the app closed and stop after the goal is reached
- [ ] Airplane mode: everything still works
