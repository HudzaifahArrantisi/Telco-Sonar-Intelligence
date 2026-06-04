import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { ConnectedTowerRadarSnapshot, RadarCellMatch } from "@/services/connectedTowerRadar";
import { HUD } from "@/theme/hud";
import { SignalQuality } from "@/utils/rfRadar";

type Props = {
  snapshot: ConnectedTowerRadarSnapshot;
};

const RADAR_SIZE = 238;
const RADAR_RADIUS = RADAR_SIZE / 2;
const CENTER_DOT_SIZE = 12;

const QUALITY_COLORS: Record<SignalQuality, string> = {
  excellent: "#39FF14",
  good: "#20E070",
  fair: "#FFB000",
  poor: "#FF4D4D",
  unknown: HUD.colors.textMuted
};

export function RfAzimuthRadar({ snapshot }: Props) {
  const connected = snapshot.connected;
  const connectedKnown = connected?.locationStatus === "known";
  const maxRange = snapshot.maxRangeMeters;

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>RF AZIMUTH RADAR</Text>
          <Text style={styles.title}>Connected Tower</Text>
        </View>
        <View style={[styles.statusPill, connectedKnown && styles.statusPillKnown]}>
          <Text style={styles.statusPillText}>{connectedKnown ? "KNOWN" : "UNKNOWN LOCATION"}</Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.radar}>
          <View style={[styles.ring, styles.ringOuter]} />
          <View style={[styles.ring, styles.ringMiddle]} />
          <View style={[styles.ring, styles.ringInner]} />
          <View style={styles.crossVertical} />
          <View style={styles.crossHorizontal} />
          <Text style={[styles.compass, styles.north]}>N</Text>
          <Text style={[styles.compass, styles.east]}>E</Text>
          <Text style={[styles.compass, styles.south]}>S</Text>
          <Text style={[styles.compass, styles.west]}>W</Text>
          <Text style={styles.rangeLabel}>{formatDistance(maxRange)}</Text>

          {snapshot.neighbors.map((match) => (
            <RadarDot key={radarKey(match)} match={match} maxRangeMeters={maxRange} />
          ))}
          {connected ? <RadarDot match={connected} maxRangeMeters={maxRange} /> : null}

          <View style={styles.centerDot}>
            <Ionicons name="person" color={HUD.colors.bg} size={9} />
          </View>
        </View>

        <View style={styles.detailPanel}>
          <Text style={styles.detailLabel}>Serving Cell</Text>
          <Text style={styles.detailValue} numberOfLines={1} adjustsFontSizeToFit>
            {connected?.cell.operatorName || "No CellInfo"}
          </Text>
          <InfoRow label="Radio" value={connected?.cell.networkType ?? "N/A"} />
          <InfoRow label="Tower" value={formatTowerStatus(connected)} />
          <InfoRow label="Lokasi" value={formatTowerLocation(connected)} />
          <InfoRow label="Cell ID" value={connected?.cell.cellId ?? "N/A"} />
          <InfoRow label="PCI" value={connected?.cell.pci ?? "N/A"} />
          <InfoRow label="TAC/LAC" value={connected?.cell.tac ?? connected?.cell.lac ?? "N/A"} />
          <InfoRow label="Range" value={connected?.distanceMeters !== null ? formatDistance(connected?.distanceMeters) : "Unknown"} />
          <InfoRow label="Azimuth" value={connected?.azimuthDegrees !== null ? `${connected?.azimuthDegrees} deg` : "Unknown"} />
          <InfoRow
            label="Quality"
            value={(connected?.signalQuality ?? "unknown").toUpperCase()}
            color={QUALITY_COLORS[connected?.signalQuality ?? "unknown"]}
          />
        </View>
      </View>
    </View>
  );
}

function RadarDot({ match, maxRangeMeters }: { match: RadarCellMatch; maxRangeMeters: number }) {
  if (match.locationStatus !== "known" || match.distanceMeters === null || match.azimuthDegrees === null) {
    return null;
  }

  const marker = projectRadarPoint(match.azimuthDegrees, match.distanceMeters, maxRangeMeters);
  const color = QUALITY_COLORS[match.signalQuality];
  const size = match.isConnected ? 18 : 10;

  return (
    <View
      style={[
        styles.radarDot,
        {
          backgroundColor: color,
          borderColor: match.isConnected ? HUD.colors.text : color,
          height: size,
          left: marker.x - size / 2,
          opacity: match.isConnected ? 1 : 0.56,
          top: marker.y - size / 2,
          width: size
        }
      ]}
    >
      {match.isConnected ? <Ionicons name="radio" color={HUD.colors.bg} size={10} /> : null}
    </View>
  );
}

function InfoRow({ label, value, color = HUD.colors.text }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

function projectRadarPoint(azimuthDegrees: number, distanceMeters: number, maxRangeMeters: number) {
  const usableRadius = RADAR_RADIUS - 24;
  const ratio = Math.min(1, Math.max(0, distanceMeters / Math.max(maxRangeMeters, 1)));
  const angle = (azimuthDegrees * Math.PI) / 180;
  return {
    x: RADAR_RADIUS + Math.sin(angle) * usableRadius * ratio,
    y: RADAR_RADIUS - Math.cos(angle) * usableRadius * ratio
  };
}

function formatDistance(value?: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A";
  return value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${Math.round(value)} m`;
}

function formatTowerStatus(match?: RadarCellMatch | null): string {
  if (!match?.tower) return "Unknown";
  const towerType = match.tower.towerType.replace("_", " ").toUpperCase();
  return `${match.tower.radio} ${towerType}`;
}

function formatTowerLocation(match?: RadarCellMatch | null): string {
  if (!match?.tower) return "Unknown";
  if (match.tower.address && match.tower.address.trim().length > 0) return match.tower.address;
  return `${match.tower.latitude.toFixed(6)}, ${match.tower.longitude.toFixed(6)}`;
}

function radarKey(match: RadarCellMatch): string {
  return `${match.cell.simSlot}-${match.cell.cellId ?? "cell"}-${match.cell.pci ?? "pci"}-${match.isConnected ? "c" : "n"}`;
}

const styles = StyleSheet.create({
  panel: {
    ...HUD.glow.cyan,
    backgroundColor: HUD.colors.panel,
    borderColor: HUD.colors.border,
    borderRadius: HUD.radius,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  eyebrow: {
    color: HUD.colors.textMuted,
    fontFamily: HUD.fonts.mono,
    fontSize: 9,
    fontWeight: "900"
  },
  title: {
    color: HUD.colors.text,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 2
  },
  statusPill: {
    backgroundColor: HUD.colors.panelSoft,
    borderColor: HUD.colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  statusPillKnown: {
    borderColor: "#39FF14"
  },
  statusPillText: {
    color: HUD.colors.text,
    fontFamily: HUD.fonts.mono,
    fontSize: 8,
    fontWeight: "900"
  },
  body: {
    alignItems: "stretch",
    flexDirection: "row",
    gap: 10
  },
  radar: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: HUD.colors.bg,
    borderColor: HUD.colors.borderStrong,
    borderRadius: RADAR_RADIUS,
    borderWidth: 1,
    height: RADAR_SIZE,
    justifyContent: "center",
    overflow: "hidden",
    width: RADAR_SIZE
  },
  ring: {
    borderColor: "rgba(255, 255, 255, 0.22)",
    borderRadius: 999,
    borderWidth: 1,
    position: "absolute"
  },
  ringOuter: { height: 210, width: 210 },
  ringMiddle: { height: 144, width: 144 },
  ringInner: { height: 72, width: 72 },
  crossVertical: {
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    height: "100%",
    position: "absolute",
    width: 1
  },
  crossHorizontal: {
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    height: 1,
    position: "absolute",
    width: "100%"
  },
  compass: {
    color: HUD.colors.text,
    fontFamily: HUD.fonts.mono,
    fontSize: 10,
    fontWeight: "900",
    position: "absolute"
  },
  north: { top: 8 },
  east: { right: 10 },
  south: { bottom: 8 },
  west: { left: 10 },
  rangeLabel: {
    bottom: 28,
    color: HUD.colors.textMuted,
    fontFamily: HUD.fonts.mono,
    fontSize: 9,
    position: "absolute"
  },
  centerDot: {
    alignItems: "center",
    backgroundColor: HUD.colors.text,
    borderRadius: CENTER_DOT_SIZE / 2,
    height: CENTER_DOT_SIZE,
    justifyContent: "center",
    position: "absolute",
    width: CENTER_DOT_SIZE
  },
  radarDot: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    position: "absolute",
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 8
  },
  detailPanel: {
    backgroundColor: HUD.colors.bgAlt,
    borderColor: HUD.colors.border,
    borderRadius: HUD.radius,
    borderWidth: 1,
    flex: 1,
    gap: 6,
    minWidth: 0,
    padding: 10
  },
  detailLabel: {
    color: HUD.colors.textMuted,
    fontSize: 9,
    fontWeight: "800"
  },
  detailValue: {
    color: HUD.colors.text,
    fontSize: 15,
    fontWeight: "900"
  },
  infoRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  infoLabel: {
    color: HUD.colors.textMuted,
    fontSize: 9,
    fontWeight: "800"
  },
  infoValue: {
    flex: 1,
    fontFamily: HUD.fonts.mono,
    fontSize: 10,
    fontWeight: "900",
    textAlign: "right"
  }
});
