import {
  localTowerDatabase,
  LocalTowerCellRecord,
  towerRecordLocation
} from "@/data/localTowerDatabase";
import { LocationPoint, TelephonyCell } from "@/types/telephony";
import {
  bearingBetweenPoints,
  classifySignalQuality,
  distanceBetweenPoints,
  SignalQuality
} from "@/utils/rfRadar";

export type TowerLocationStatus = "known" | "unknown";

export type RadarCellMatch = {
  cell: TelephonyCell;
  tower: LocalTowerCellRecord | null;
  locationStatus: TowerLocationStatus;
  distanceMeters: number | null;
  azimuthDegrees: number | null;
  signalQuality: SignalQuality;
  isConnected: boolean;
};

export type ConnectedTowerRadarSnapshot = {
  connected: RadarCellMatch | null;
  neighbors: RadarCellMatch[];
  userLocation: LocationPoint | null;
  maxRangeMeters: number;
  generatedAt: number;
};

export function buildConnectedTowerRadarSnapshot(
  cells: TelephonyCell[],
  userLocation: LocationPoint | null,
  selectedSimSlot?: number
): ConnectedTowerRadarSnapshot {
  const connectedCell = getConnectedCell(cells, selectedSimSlot);
  const connected = connectedCell ? buildRadarMatch(connectedCell, userLocation, true) : null;
  const neighbors = cells
    .filter((cell) => cell !== connectedCell)
    .map((cell) => buildRadarMatch(cell, userLocation, false))
    .filter((match) => match.locationStatus === "known")
    .sort((a, b) => (a.distanceMeters ?? Number.MAX_SAFE_INTEGER) - (b.distanceMeters ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 8);

  const knownDistances = [connected, ...neighbors]
    .map((match) => match?.distanceMeters)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  return {
    connected,
    neighbors,
    userLocation,
    maxRangeMeters: Math.max(250, Math.ceil((Math.max(...knownDistances, 0) * 1.2) / 100) * 100),
    generatedAt: Date.now()
  };
}

function buildRadarMatch(
  cell: TelephonyCell,
  userLocation: LocationPoint | null,
  isConnected: boolean
): RadarCellMatch {
  const tower = findTowerRecordForCell(cell);
  const towerLocation = tower ? towerRecordLocation(tower) : null;
  const hasKnownLocation = towerLocation !== null && userLocation !== null;
  const distanceMeters = hasKnownLocation ? Math.round(distanceBetweenPoints(userLocation, towerLocation)) : null;
  const azimuthDegrees = hasKnownLocation ? Math.round(bearingBetweenPoints(userLocation, towerLocation)) : null;

  return {
    cell,
    tower,
    locationStatus: hasKnownLocation ? "known" : "unknown",
    distanceMeters,
    azimuthDegrees,
    signalQuality: classifySignalQuality(cell.rsrp, cell.sinr),
    isConnected
  };
}

function getConnectedCell(cells: TelephonyCell[], selectedSimSlot?: number): TelephonyCell | null {
  const selectedCells =
    typeof selectedSimSlot === "number" ? cells.filter((cell) => cell.simSlot === selectedSimSlot) : cells;
  return (
    selectedCells.find((cell) => cell.isRegistered) ??
    selectedCells[0] ??
    cells.find((cell) => cell.isRegistered) ??
    cells[0] ??
    null
  );
}

function findTowerRecordForCell(cell: TelephonyCell): LocalTowerCellRecord | null {
  const matches = localTowerDatabase
    .filter((record) => valuesMatch(record.mcc, cell.mcc))
    .filter((record) => valuesMatch(record.mnc, cell.mnc))
    .filter((record) => valuesMatch(record.cellId, cell.cellId))
    .filter((record) => optionalAreaMatches(record, cell))
    .filter((record) => optionalValuesMatch(record.pci, cell.pci))
    .filter((record) => radioMatches(record.radio, cell.networkType));

  return matches[0] ?? null;
}

function optionalAreaMatches(record: LocalTowerCellRecord, cell: TelephonyCell): boolean {
  const recordArea = record.tac ?? record.lac ?? null;
  const cellArea = cell.tac ?? cell.lac ?? null;
  return optionalValuesMatch(recordArea, cellArea);
}

function valuesMatch(a?: string | null, b?: string | null): boolean {
  return normalize(a) !== "" && normalize(a) === normalize(b);
}

function optionalValuesMatch(a?: string | null, b?: string | null): boolean {
  return normalize(a) === "" || normalize(b) === "" || normalize(a) === normalize(b);
}

function radioMatches(recordRadio: LocalTowerCellRecord["radio"], cellRadio: TelephonyCell["networkType"]): boolean {
  if (recordRadio === cellRadio) return true;
  if (recordRadio === "NR" && (cellRadio === "5G SA" || cellRadio === "5G NSA")) return true;
  return false;
}

function normalize(value?: string | null): string {
  return String(value ?? "").trim().toLowerCase();
}
