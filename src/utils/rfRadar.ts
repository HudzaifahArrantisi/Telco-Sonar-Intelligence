import { LocationPoint } from "@/types/telephony";

const EARTH_RADIUS_METERS = 6371000;

export type SignalQuality = "excellent" | "good" | "fair" | "poor" | "unknown";

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

export function normalizeAzimuth(value: number): number {
  return ((value % 360) + 360) % 360;
}

export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const sourceLat = toRadians(lat1);
  const targetLat = toRadians(lat2);
  const h =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(sourceLat) * Math.cos(targetLat) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function calculateBearingDegrees(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const sourceLat = toRadians(lat1);
  const targetLat = toRadians(lat2);
  const deltaLon = toRadians(lon2 - lon1);
  const y = Math.sin(deltaLon) * Math.cos(targetLat);
  const x =
    Math.cos(sourceLat) * Math.sin(targetLat) -
    Math.sin(sourceLat) * Math.cos(targetLat) * Math.cos(deltaLon);
  return normalizeAzimuth(toDegrees(Math.atan2(y, x)));
}

export function classifySignalQuality(rsrp?: number | null, sinr?: number | null): SignalQuality {
  if (typeof rsrp !== "number" && typeof sinr !== "number") return "unknown";

  if ((typeof rsrp === "number" && rsrp >= -85) || (typeof sinr === "number" && sinr >= 20)) {
    return "excellent";
  }
  if ((typeof rsrp === "number" && rsrp >= -95) || (typeof sinr === "number" && sinr >= 13)) {
    return "good";
  }
  if ((typeof rsrp === "number" && rsrp >= -105) || (typeof sinr === "number" && sinr >= 5)) {
    return "fair";
  }
  if (typeof rsrp === "number" || typeof sinr === "number") return "poor";
  return "unknown";
}

export function distanceBetweenPoints(from: LocationPoint, to: LocationPoint): number {
  return calculateDistanceMeters(from.latitude, from.longitude, to.latitude, to.longitude);
}

export function bearingBetweenPoints(from: LocationPoint, to: LocationPoint): number {
  return calculateBearingDegrees(from.latitude, from.longitude, to.latitude, to.longitude);
}
