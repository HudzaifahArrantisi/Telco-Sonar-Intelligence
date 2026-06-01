# Telco RF Monitor

Prototype Android RF engineering monitor built with React Native, Expo Dev Client, TypeScript, and a Kotlin native module. It is intentionally not an Expo Go app because Android telephony RF fields require native access.

## Features

- Real-time dashboard for LTE/NR/WCDMA/GSM cell information from `TelephonyManager.getAllCellInfo()`.
- Dual-SIM aware reads via `SubscriptionManager` when Android exposes active subscriptions.
- Registered-cell priority with observed neighbor cells listed separately.
- Signal status badges from RSRP thresholds.
- Map view with user location, estimated azimuth, adjustable radius, and 65 degree default sector beamwidth.
- Local SQLite drive-test logs with GPS coordinates and CSV export.
- Settings for polling interval, default radius, beamwidth, and automatic logging.

The map sector is an estimate. The app shows this disclaimer in the UI:

> Coverage, azimuth, and beamwidth visualization are high-precision estimations based on available Android telephony data and user-defined parameters. They are not absolute measurements.

## Project Structure

```text
app/                         Expo Router screens
src/components/              Reusable RF UI components
src/screens/                 Dashboard, map, log, settings, permission screens
src/services/                Telephony polling, runtime state, GPS/log orchestration
src/native/                  TypeScript bridge to TelephonyModule
src/storage/                 SQLite log store and AsyncStorage settings
src/maps/                    Sector polygon math
src/utils/                   Band and signal helpers
src/types/                   Shared TypeScript types
modules/telephony-module/    Local Expo Kotlin native module
```

## Install

```bash
npm install
npx expo install expo-dev-client
```

The map uses MapLibre GL Native with OpenStreetMap tiles. No API key or billing account is required.

## Run On Android Dev Build

Use a physical Android phone with an active SIM for meaningful CellInfo. Emulators usually return empty or synthetic telephony data.

```bash
npx expo prebuild
npx expo run:android
```

Start Metro for the dev client:

```bash
npm run start
```

## EAS Development Build

```bash
npx expo install expo-dev-client
eas build --profile development --platform android
```

Install the generated development build on the phone, then run `npm run start`.

## Debug APK

After prebuild:

```bash
cd android
./gradlew assembleDebug
```

APK output:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

On Windows PowerShell:

```powershell
cd android
.\gradlew.bat assembleDebug
```

## Android Permissions

Declared in `app.json` and requested at startup:

- `ACCESS_FINE_LOCATION`
- `ACCESS_COARSE_LOCATION`
- `READ_PHONE_STATE`
- `ACCESS_NETWORK_STATE`
- `INTERNET`
- `FOREGROUND_SERVICE`

Android may still restrict PCI, EARFCN/NRARFCN, RSRP, RSRQ, SINR, neighbor cells, or 5G fields depending on OS version, chipset, OEM policy, SIM state, carrier policy, and current radio state.

## Native Module

The local Expo module is `modules/telephony-module`.

Native Android class:

```text
modules/telephony-module/android/src/main/java/com/telcorf/telephony/TelephonyModule.kt
```

Exports:

- `isTelephonyAvailableAsync()`
- `getCurrentCellsAsync()`

The module reads:

- `CellInfoLte`
- `CellInfoNr`
- `CellInfoWcdma`
- `CellInfoGsm`

Returned fields include SIM slot, operator, MCC/MNC, network type, Cell ID, TAC/LAC, PCI/PSC/BSIC, EARFCN/NRARFCN, signal metrics, registration state, and timestamp.

## Testing On A Real Phone

1. Enable Developer Options and USB debugging.
2. Insert at least one active SIM.
3. Enable location services.
4. Connect the phone with USB and confirm `adb devices`.
5. Run `npx expo prebuild`.
6. Run `npx expo run:android`.
7. Grant location and phone-state permissions in the app.
8. Compare the dashboard against another RF tool. Expect differences because Android APIs and OEMs expose different subsets of radio data.

## Useful Commands

```bash
npm run typecheck
npm run android
npm run prebuild
```
