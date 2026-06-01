import { LocationPoint, TelephonyCell } from "@/types/telephony";
import { destinationPoint } from "@/maps/sector";

export type SignalTrend = "improving" | "degrading" | "stable" | "unknown";
export type MovementTrend = "closer" | "farther" | "lateral" | "stationary" | "unknown";

export type TowerEstimation = {
  location: LocationPoint;
  azimuth: number;
  radiusMeters: number;
  beamwidth: number;
  confidence: number;
  distanceMeters: number;
  dotted: boolean;
};

export type RfIntelligenceState = {
  previousCell: TelephonyCell | null;
  currentCell: TelephonyCell | null;
  signalTrend: SignalTrend;
  movementTrend: MovementTrend;
  towerSim1: TowerEstimation | null;
  towerSim2: TowerEstimation | null;
  handover: boolean;
  pciChanged: boolean;
  areaChanged: boolean;
  radioChanged: boolean;
  lastLocation: LocationPoint | null;
  route: DrivePoint[];
};

export type DrivePoint = LocationPoint & {
  rsrp: number | null;
  timestamp: number;
};

const DEFAULT_STATE: RfIntelligenceState = {
  previousCell: null,
  currentCell: null,
  signalTrend: "unknown",
  movementTrend: "unknown",
  towerSim1: null,
  towerSim2: null,
  handover: false,
  pciChanged: false,
  areaChanged: false,
  radioChanged: false,
  lastLocation: null,
  route: []
};

function normalize(value: string | null | undefined): string {
  return value ?? "";
}

function bearingBetween(from: LocationPoint, to: LocationPoint): number {
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const deltaLon = ((to.longitude - from.longitude) * Math.PI) / 180;
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function distanceMeters(a: LocationPoint, b: LocationPoint): number {
  const earthRadius = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * earthRadius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function signalTrend(previous: TelephonyCell | null, current: TelephonyCell | null): SignalTrend {
  if (typeof previous?.rsrp !== "number" || typeof current?.rsrp !== "number") return "unknown";
  const delta = current.rsrp - previous.rsrp;
  if (delta >= 3) return "improving";
  if (delta <= -3) return "degrading";
  return "stable";
}

function radiusFromSignal(cell: TelephonyCell | null, settingsRadius: number): number {
  if (!cell) return settingsRadius;
  if (typeof cell.timingAdvance === "number" && cell.timingAdvance > 0) {
    return Math.max(180, Math.min(8000, cell.timingAdvance * 78));
  }
  const rsrp = cell.rsrp;
  if (typeof rsrp !== "number") return settingsRadius * 1.5;
  if (rsrp >= -75) return 450;
  if (rsrp >= -85) return 800;
  if (rsrp >= -95) return 1400;
  if (rsrp >= -105) return 2400;
  return 4200;
}

function confidenceFor(cell: TelephonyCell | null, location: LocationPoint | null, routeSize: number): number {
  if (!cell || !location) return 0;
  let confidence = 25;
  if (cell.cellId) confidence += 12;
  if (cell.pci) confidence += 10;
  if (cell.tac ?? cell.lac) confidence += 8;
  if (typeof cell.rsrp === "number") confidence += 14;
  if (typeof cell.sinr === "number") confidence += 8;
  if (typeof cell.timingAdvance === "number") confidence += 18;
  if (routeSize >= 3) confidence += 10;
  if (typeof location.accuracy === "number") confidence += Math.max(0, 10 - location.accuracy / 8);
  return Math.round(Math.max(0, Math.min(100, confidence)));
}

function opposite(degrees: number): number {
  return (degrees + 180) % 360;
}

function blendBearing(previous: number, next: number, weight: number): number {
  const delta = ((((next - previous) % 360) + 540) % 360) - 180;
  return (previous + delta * weight + 360) % 360;
}

function primaryCellForSlot(cells: TelephonyCell[], simSlot: number): TelephonyCell | null {
  const slotCells = cells.filter((cell) => cell.simSlot === simSlot);
  return slotCells.find((cell) => cell.isRegistered) ?? slotCells[0] ?? null;
}

function estimateTowerForCell({
  cell,
  location,
  movementBearing,
  previousTower,
  settingsRadius,
  settingsBeamwidth,
  trend,
  handover,
  routeSize
}: {
  cell: TelephonyCell | null;
  location: LocationPoint | null;
  movementBearing: number;
  previousTower: TowerEstimation | null;
  settingsRadius: number;
  settingsBeamwidth: number;
  trend: SignalTrend;
  handover: boolean;
  routeSize: number;
}): TowerEstimation | null {
  if (!cell) return null;
  if (!location) return previousTower;

  const radiusMeters = radiusFromSignal(cell, settingsRadius);
  const distanceToTower = Math.max(120, radiusMeters * 0.58);
  const inferredTowerBearing =
    trend === "improving"
      ? movementBearing
      : trend === "degrading"
        ? opposite(movementBearing)
        : previousTower?.azimuth ?? opposite(movementBearing);
  const azimuth = previousTower
    ? blendBearing(previousTower.azimuth, opposite(inferredTowerBearing), handover ? 0.75 : 0.32)
    : opposite(inferredTowerBearing);
  const towerBearingFromUser = opposite(azimuth);
  const confidence = confidenceFor(cell, location, routeSize);

  return {
    location: destinationPoint(location, towerBearingFromUser, distanceToTower),
    azimuth,
    radiusMeters,
    beamwidth: Math.max(35, Math.min(110, settingsBeamwidth + (confidence < 55 ? 20 : 0))),
    confidence,
    distanceMeters: distanceToTower,
    dotted: confidence < 58
  };
}

export function updateRfIntelligence(
  previousState: RfIntelligenceState | null,
  cells: TelephonyCell[],
  location: LocationPoint | null,
  settingsRadius: number,
  settingsBeamwidth: number
): RfIntelligenceState {
  const prior = previousState ?? DEFAULT_STATE;
  const currentCell = cells.find((cell) => cell.isRegistered) ?? cells[0] ?? null;
  const sim1Cell = primaryCellForSlot(cells, 0);
  const sim2Cell = primaryCellForSlot(cells, 1);
  const previousCell = prior.currentCell;
  const trend = signalTrend(previousCell, currentCell);
  const handover = normalize(previousCell?.cellId) !== normalize(currentCell?.cellId) && !!previousCell && !!currentCell;
  const pciChanged = normalize(previousCell?.pci) !== normalize(currentCell?.pci) && !!previousCell && !!currentCell;
  const areaChanged =
    (normalize(previousCell?.tac ?? previousCell?.lac) !== normalize(currentCell?.tac ?? currentCell?.lac)) && !!previousCell && !!currentCell;
  const radioChanged = normalize(previousCell?.networkType) !== normalize(currentCell?.networkType) && !!previousCell && !!currentCell;
  const route =
    location && currentCell
      ? [
          ...prior.route,
          {
            ...location,
            rsrp: currentCell.rsrp,
            timestamp: Date.now()
          }
        ].slice(-240)
      : prior.route;

  const movementBearing =
    location && prior.lastLocation && distanceMeters(prior.lastLocation, location) > 3
      ? bearingBetween(prior.lastLocation, location)
      : location?.heading ?? prior.towerSim1?.azimuth ?? prior.towerSim2?.azimuth ?? 0;

  const sim1Trend = signalTrend(previousCell?.simSlot === 0 ? previousCell : null, sim1Cell);
  const sim2Trend = signalTrend(previousCell?.simSlot === 1 ? previousCell : null, sim2Cell);
  const sim1Handover =
    normalize(previousCell?.simSlot === 0 ? previousCell.cellId : null) !== normalize(sim1Cell?.cellId) &&
    previousCell?.simSlot === 0 &&
    !!sim1Cell;
  const sim2Handover =
    normalize(previousCell?.simSlot === 1 ? previousCell.cellId : null) !== normalize(sim2Cell?.cellId) &&
    previousCell?.simSlot === 1 &&
    !!sim2Cell;
  const towerSim1 = estimateTowerForCell({
    cell: sim1Cell,
    location,
    movementBearing,
    previousTower: prior.towerSim1,
    settingsRadius,
    settingsBeamwidth,
    trend: sim1Trend,
    handover: sim1Handover,
    routeSize: route.length
  });
  const towerSim2 = estimateTowerForCell({
    cell: sim2Cell,
    location,
    movementBearing,
    previousTower: prior.towerSim2,
    settingsRadius,
    settingsBeamwidth,
    trend: sim2Trend,
    handover: sim2Handover,
    routeSize: route.length
  });
  const activeTower = currentCell?.simSlot === 1 ? towerSim2 : towerSim1;
  const previousActiveTower = currentCell?.simSlot === 1 ? prior.towerSim2 : prior.towerSim1;
  const activeTowerDistance = activeTower?.distanceMeters ?? null;
  const oldDistance = previousActiveTower && location ? distanceMeters(location, previousActiveTower.location) : null;
  const movementTrend: MovementTrend =
    !location || !activeTower
      ? "unknown"
      : (location.speed ?? 0) < 0.7
        ? "stationary"
        : oldDistance !== null && activeTowerDistance !== null && activeTowerDistance < oldDistance - 25
          ? "closer"
          : oldDistance !== null && activeTowerDistance !== null && activeTowerDistance > oldDistance + 25
            ? "farther"
            : "lateral";

  return {
    previousCell,
    currentCell,
    signalTrend: trend,
    movementTrend,
    towerSim1,
    towerSim2,
    handover,
    pciChanged,
    areaChanged,
    radioChanged,
    lastLocation: location ?? prior.lastLocation,
    route
  };
}

export function initialRfIntelligenceState(): RfIntelligenceState {
  return DEFAULT_STATE;
}
