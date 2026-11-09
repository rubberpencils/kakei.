# kakie. Expo to native Kotlin port

## Goal

Replace the Expo / React Native app with a native Android app in Kotlin that behaves, looks and syncs exactly like it. The Node server in `server/` stays unchanged; the Kotlin app speaks the same HTTP API.

## Decisions (approved)

- Kotlin Gradle project at the repo root (`app/`). Expo files (`src/`, `modules/`, `plugins/`, `scripts/`, `assets/`, `node_modules/`, `package*.json`, `app.json`, `eas.json`, `tsconfig*`, `eslint.config.js`, `expo-env.d.ts`, `.expo/`, `.tmp-check/`) are deleted once the port is verified on the emulator.
- `server/` is kept as is.
- Android only. iOS-only (Shortcuts) and web-only branches are dropped; every Android code path is kept.

## Stack

- Jetpack Compose, single activity, Navigation Compose.
- kotlinx.serialization for the persisted state and the server API.
- `HttpURLConnection` for HTTP (12 s timeout, same error strings as `api.ts`).
- Fonts: Syne 700/800, Plus Jakarta Sans 400/500/600/700, JetBrains Mono 500 (`res/font`).
- Icons: MaterialCommunityIcons TTF plus its glyph map (assets), so every icon name used by the app or sent by the server renders.
- Package `app.kakie`, app name `kakie.`, scheme `kakie://`, permissions `READ_SMS`, `RECEIVE_SMS`, `VIBRATE`, `INTERNET`, cleartext allowed.

## Units

| Kotlin | Ports |
| --- | --- |
| `lib/Types.kt` | `types.ts`, `Op`/`Remote`/`Invite` from `api.ts` |
| `lib/Format.kt` | `format.ts` (Indian digit grouping, local-time ISO parsing) |
| `lib/Ledger.kt` | `ledger.ts` |
| `lib/Parser.kt` | `parser.ts` |
| `lib/Seed.kt` | `seed.ts` |
| `lib/Upi.kt` | `upi.ts` |
| `lib/Api.kt` | `api.ts` `call`, `cleanBase`, `ApiError` |
| `lib/Store.kt` | `store.tsx` (state, outbox, sync, polling, SMS scan, all actions) |
| `lib/Device.kt` | `sms.ts` plus the `kakie-sms` native module (inbox read, UPI intent result, SMS permission) |
| `ui/Theme.kt` | `theme.ts` palettes, fonts, tag colours, rail maps |
| `ui/Components.kt` | `components/ui.tsx` |
| `ui/Splash.kt` | `components/splash.tsx` |
| `ui/Nav.kt` | `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `app/sms.tsx`, deep links |
| `ui/screens/*.kt` | one file per route in `src/app` |

## Behaviour to keep

- Store semantics: optimistic ops into an outbox, 400 ms debounced push, `GET /sync` rebase that replays the outbox and posts due recurring expenses, 401 signs out with the same toast, 20 s polling while in the foreground, SMS scan on resume when SMS import is on, UPI IDs never persisted.
- Screen transitions: slide from right (400 ms, accelerate-decelerate), Add slides up from the bottom, Search fades up 8%, onboarding fades, reduced motion turns them into fades.
- Splash: system splash `#0e0e10` with the logo, then the animated "kakie." letters overlay that fades out once the store has loaded.
- Haptics: Expo's waveforms (selection 0/50 ms at 30, success 0/40/100/40 ms at 0/50/0/60).
- Text metrics: `includeFontPadding = true` to match React Native's Android text layout.

## Verification

- JVM unit test that ports every assertion in `src/lib/selfcheck.ts`.
- Build and install on the `Medium_Phone_API_37.0` emulator, run against the local server (`http://10.0.2.2:4000`), walk every screen in light and dark, compare against the Expo web render of the original.
