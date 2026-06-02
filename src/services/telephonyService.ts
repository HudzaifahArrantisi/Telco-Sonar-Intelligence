import * as Location from "expo-location";
import { getActiveWifiSsidAsync, getCurrentCellsAsync } from "@/native/TelephonyModule";
import { insertLog } from "@/storage/logStore";
import { DriveLog, LocationPoint, TelephonyCell } from "@/types/telephony";
import { lteBandFromEarfcn, nrBandFromArfcn } from "@/utils/bands";

const MAX_ACCEPTABLE_ACCURACY_METERS = 25;
const MAX_STATIONARY_JUMP_METERS = 50;
const STATIONARY_JUMP_WINDOW_MS = 5000;
const LOW_SPEED_METERS_PER_SECOND = 1;

let lastValidLocation: LocationPoint | null = null;

export async function readLocation(): Promise<LocationPoint | null> {
  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) return null;
  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Highest,
    mayShowUserSettingsDialog: true
  });
  const nextLocation: LocationPoint = {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    heading: position.coords.heading,
    speed: position.coords.speed,
    altitude: position.coords.altitude,
    timestamp: position.timestamp
  };

  if (
    typeof nextLocation.accuracy === "number" &&
    nextLocation.accuracy > MAX_ACCEPTABLE_ACCURACY_METERS
  ) {
    return lastValidLocation;
  }

  if (isStationaryGpsJump(nextLocation, lastValidLocation)) {
    return lastValidLocation;
  }

  lastValidLocation = nextLocation;
  return nextLocation;
}

export async function readCells(): Promise<TelephonyCell[]> {
  const cells = await getCurrentCellsAsync();
  return cells.map((cell) => ({
    ...cell,
    band: cell.band ?? lteBandFromEarfcn(cell.earfcn) ?? nrBandFromArfcn(cell.nrarfcn)
  }));
}

export async function readActiveWifiSsid(): Promise<string | null> {
  return getActiveWifiSsidAsync();
}


export function buildDriveLog(cell: TelephonyCell, location: LocationPoint | null): DriveLog {
  return {
    timestamp: Date.now(),
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
    operator: cell.operatorName || "Unknown",
    networkType: cell.networkType || "Unknown",
    cellId: cell.cellId,
    tac: cell.tac ?? cell.lac,
    pci: cell.pci,
    band: cell.band,
    rsrp: cell.rsrp,
    rsrq: cell.rsrq,
    sinr: cell.sinr,
    speed: location?.speed ?? null,
    heading: location?.heading ?? null,
    altitude: location?.altitude ?? null
  };
}

export async function saveCurrentLog(cell: TelephonyCell, location: LocationPoint | null): Promise<void> {
  await insertLog(buildDriveLog(cell, location));
}

function isStationaryGpsJump(next: LocationPoint, previous: LocationPoint | null): boolean {
  if (!previous) return false;
  const nextTimestamp = next.timestamp ?? Date.now();
  const previousTimestamp = previous.timestamp ?? nextTimestamp;
  const elapsedMs = Math.abs(nextTimestamp - previousTimestamp);
  if (elapsedMs > STATIONARY_JUMP_WINDOW_MS) return false;

  const speed = next.speed ?? previous.speed ?? 0;
  if (speed > LOW_SPEED_METERS_PER_SECOND) return false;

  return distanceMeters(previous, next) > MAX_STATIONARY_JUMP_METERS;
}

function distanceMeters(a: LocationPoint, b: LocationPoint): number {
  const earthRadiusMeters = 6371000;
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}
