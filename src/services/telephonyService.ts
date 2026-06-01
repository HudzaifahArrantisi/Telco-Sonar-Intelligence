import * as Location from "expo-location";
import { getActiveWifiSsidAsync, getCurrentCellsAsync } from "@/native/TelephonyModule";
import { insertLog } from "@/storage/logStore";
import { DriveLog, LocationPoint, TelephonyCell } from "@/types/telephony";
import { lteBandFromEarfcn, nrBandFromArfcn } from "@/utils/bands";

export async function readLocation(): Promise<LocationPoint | null> {
  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) return null;
  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Highest,
    mayShowUserSettingsDialog: true
  });
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    heading: position.coords.heading,
    speed: position.coords.speed,
    altitude: position.coords.altitude,
    timestamp: position.timestamp
  };
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
