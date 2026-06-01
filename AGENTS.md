# Telco RF Monitor — Agent Guide

## Dev Commands
- `npm run typecheck` — `tsc --noEmit` (run first)
- `npm run lint` — `expo lint` (run second)
- `npm run android` — build + install on device
- `npm run start` — `expo start --dev-client`
- `npm run prebuild` — `expo prebuild`

Run typecheck before any commit.

## Architecture
- **File-based routing** via `app/` (expo-router v5). Entry: `app/_layout.tsx` (tabs).
- **Module-level mutable state** in `app/index.tsx:8-13` (`getLatestRuntimeState()`) feeds Map and Settings routes. No React Context.
- **Path alias:** `@/` → `src/` (configured in `tsconfig.json`).
- **Custom native module** at `modules/telephony-module/`, Android-only (Kotlin). Referenced as `file:` dep in `package.json`.
- **Data flow:** `telephonyService.ts` → native module (`TelephonyModule.kt`) for CellInfo + expo-location for GPS. Drive logs written to Expo SQLite (`logStore.ts`). Settings persisted via AsyncStorage.

## Constraints & Quirks
- **Physical Android device only** — emulators return empty CellInfo.
- **Expo Dev Client required** — custom native module breaks Expo Go.
- Permissions: Location (foreground) + `READ_PHONE_STATE`. Gate in `app/index.tsx:33`.
- Map uses MapLibre GL Native + OpenStreetMap tiles. No API key or billing required.
- No tests exist. No CI/CD. No formatter config.
- `modules/telephony-module/android/build.gradle` has `compileSdk 35`, `minSdk 23`.
- Coverage sector visualization uses heuristic polygons (`maps/sector.ts`), not real antenna data.
