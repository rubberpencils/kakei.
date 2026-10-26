# Native Kotlin port

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan. Use ponytail: the smallest complete change. Do not add a second architecture.

**Goal:** The phone app is pure Kotlin and Jetpack Compose. The Node server stays.

**Architecture:** `app/` is the Android application. `app/src/main/java/app/kakie/core` is the parser, ledger, money format, and input rules, checked by JVM tests that mirror `src/lib/selfcheck.ts`. `ui/KakeiUi.kt` is every route. `sms/` is the receiver, file actions, cash widget, and local MCP. The server in `server/` is unchanged.

**Tech Stack:** Kotlin 2.0, AGP 8.7, Compose BOM 2024.10, minSdk 26, compileSdk 35. CI emulator is Android 16 (API 36).

## Global Constraints

- Package `app.kakie`, scheme `kakei`.
- Cream `#f3efe6`, ink `#16141a`, brand `#653de9`.
- Paise stay. Last share takes the odd paisa.
- Signup is phone and password. Reset still uses a code.
- Amounts on Add use the on-screen pad. Other fields use the system keyboard via `cleanAmount`, `cleanPhone`, `cleanNumber`.
- shortcut: Compose screens follow the routes, copy, and palette. They are not a frame-by-frame copy of the Reanimated React Native screens. Match a screen when a device shows it wrong.

## Tasks

### Task 1: Core tests

**Files:** `app/src/test/java/app/kakie/core/CoreTest.kt`

- [x] Parser samples, odd paisa, ledger checks already live in `CoreTest`.
- [x] Run `./gradlew :app:testDebugUnitTest`.

### Task 2: Screens

**Files:** `app/src/main/java/app/kakie/ui/KakeiUi.kt`

Routes: onboarding, reset, home, personal, groups, insights, profile, add, search, review, group, settings, expense, split, quick, settle, person, balances, card, new-group, join, developer, ask, pro, lock.

### Task 3: Android 16 e2e

**Files:** `app/src/androidTest/java/app/kakie/OnboardingTest.kt`, `.github/workflows/ci.yml`

- [x] `connectedDebugAndroidTest` on API 36, x86_64, animations off.
- [x] Debug APK includes `x86_64` so the emulator can install it.
