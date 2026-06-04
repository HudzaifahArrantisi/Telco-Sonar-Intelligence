import { defaultSettings } from "@/storage/settings";
import { LocationPoint, Settings, TelephonyCell } from "@/types/telephony";

let latestCells: TelephonyCell[] = [];
let latestLocation: LocationPoint | null = null;
let latestSettings: Settings = defaultSettings;
let isMonitoringActive = true;

export function getLatestRuntimeState() {
  return { 
    cells: latestCells, 
    location: latestLocation, 
    settings: latestSettings,
    isMonitoringActive 
  };
}

export function setLatestCells(cells: TelephonyCell[], location: LocationPoint | null) {
  latestCells = cells;
  latestLocation = location;
}

export function setLatestSettings(settings: Settings) {
  latestSettings = settings;
}

export function setMonitoringActive(active: boolean) {
  isMonitoringActive = active;
}
