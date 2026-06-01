export function lteBandFromEarfcn(earfcn?: string | null): string | null {
  const value = Number(earfcn);
  if (!Number.isFinite(value)) return null;
  const ranges: [number, number, string][] = [
    [0, 599, "B1"],
    [600, 1199, "B2"],
    [1200, 1949, "B3"],
    [1950, 2399, "B4"],
    [2400, 2649, "B5"],
    [2750, 3449, "B7"],
    [3450, 3799, "B8"],
    [6150, 6449, "B20"],
    [9210, 9659, "B28"],
    [37750, 38249, "B38"],
    [38650, 39649, "B40"],
    [39650, 41589, "B41"]
  ];
  return ranges.find(([start, end]) => value >= start && value <= end)?.[2] ?? null;
}

export function nrBandFromArfcn(nrarfcn?: string | null): string | null {
  const value = Number(nrarfcn);
  if (!Number.isFinite(value)) return null;
  if (value >= 422000 && value <= 434000) return "n1";
  if (value >= 386000 && value <= 398000) return "n3";
  if (value >= 151600 && value <= 160600) return "n28";
  if (value >= 499200 && value <= 537999) return "n41";
  if (value >= 620000 && value <= 653333) return "n78";
  return null;
}
