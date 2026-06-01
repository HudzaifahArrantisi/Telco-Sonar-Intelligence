import { defaultSettings } from "@/storage/settings";
import { LocationPoint, Settings, TelephonyCell } from "@/types/telephony";

let latestCells: TelephonyCell[] = [];
let latestLocation: LocationPoint | null = null;
let latestSettings: Settings = defaultSettings;

export function getLatestRuntimeState() {
  return { cells: latestCells, location: latestLocation, settings: latestSettings };
}

export function setLatestCells(cells: TelephonyCell[], location: LocationPoint | null) {
  latestCells = cells;
  latestLocation = location;
}

export function setLatestSettings(settings: Settings) {
  latestSettings = settings;
}
