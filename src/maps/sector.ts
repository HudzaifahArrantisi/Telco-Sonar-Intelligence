import { LocationPoint } from "@/types/telephony";

const EARTH_RADIUS_M = 6371000;

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

function toDeg(value: number): number {
  return (value * 180) / Math.PI;
}

export function destinationPoint(
  origin: LocationPoint,
  bearingDegrees: number,
  distanceMeters: number
): LocationPoint {
  const angularDistance = distanceMeters / EARTH_RADIUS_M;
  const bearing = toRad(bearingDegrees);
  const lat1 = toRad(origin.latitude);
  const lon1 = toRad(origin.longitude);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  return { latitude: toDeg(lat2), longitude: toDeg(lon2) };
}

export function createSectorPolygon(
  origin: LocationPoint,
  azimuth: number,
  radiusMeters: number,
  beamwidth: number,
  steps = 24
): LocationPoint[] {
  const half = beamwidth / 2;
  const points: LocationPoint[] = [origin];
  for (let i = 0; i <= steps; i += 1) {
    const bearing = azimuth - half + (beamwidth * i) / steps;
    points.push(destinationPoint(origin, bearing, radiusMeters));
  }
  points.push(origin);
  return points;
}
