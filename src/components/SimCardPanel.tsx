import { Pressable, StyleSheet, Text, View } from "react-native";
import { TelephonyCell } from "@/types/telephony";
import { formatValue } from "@/utils/signal";

type Props = {
  cell: TelephonyCell | null;
  simSlot: number;
  isActive: boolean;
  accentColor: string;
  onPress?: () => void;
};

function networkBadgeColor(networkType: string | undefined): string {
  if (!networkType) return "#7E8A99";
  if (networkType.includes("5G")) return "#A855F7";
  if (networkType === "LTE" || networkType === "4G") return "#22C55E";
  if (networkType === "WCDMA") return "#3B82F6";
  return "#7E8A99";
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export function SimCardPanel({ cell, simSlot, isActive, accentColor, onPress }: Props) {
  const badgeColor = networkBadgeColor(cell?.networkType);

  if (!cell) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          styles.cardEmpty,
          isActive && { borderColor: accentColor, borderWidth: 1.5 },
          pressed && { opacity: 0.85 }
        ]}
      >
        <Text style={styles.simTitle}>SIM {simSlot + 1}</Text>
        <Text style={styles.noSim}>No SIM Detected</Text>
        <Text style={styles.noSimHint}>Insert SIM card or{"\n"}enable mobile data</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        isActive && { borderColor: accentColor, borderWidth: 1.5 },
        pressed && { opacity: 0.85 }
      ]}
    >
      {/* Header */}
      <View style={styles.cardHeader}>
        <Text style={styles.simTitle}>SIM {simSlot + 1}</Text>
        <View style={[styles.networkBadge, { backgroundColor: badgeColor }]}>
          <Text style={styles.networkBadgeText}>{cell.networkType}</Text>
        </View>
      </View>

      {/* Operator */}
      <Text style={styles.operator} numberOfLines={1}>
        {cell.operatorName || "Unknown"}
      </Text>
      <Text style={styles.subtitle}>
        {cell.isRegistered ? "REGISTERED" : "OBSERVED"}
      </Text>

      {/* Metrics Grid */}
      <View style={styles.metricsGrid}>
        <View style={styles.metricsCol}>
          <MetricRow label="LAC" value={formatValue(cell.lac ?? cell.tac)} />
          <MetricRow label="PCI" value={formatValue(cell.pci)} />
          <MetricRow label="TA" value={formatValue(cell.timingAdvance ?? "-")} />
          <MetricRow label="RSRQ" value={formatValue(cell.rsrq, " dB")} />
        </View>
        <View style={styles.metricsCol}>
          <MetricRow label="Cell ID" value={formatCellId(cell.cellId)} />
          <MetricRow label="Band" value={formatValue(cell.band)} />
          <MetricRow label="RSRP" value={formatValue(cell.rsrp, " dBm")} />
          <MetricRow label="SINR" value={formatValue(cell.sinr, " dB")} />
        </View>
      </View>
    </Pressable>
  );
}

function formatCellId(cellId: string | null): string {
  if (!cellId) return "N/A";
  const num = parseInt(cellId, 10);
  if (isNaN(num)) return cellId;
  // Extract sector (lower 8 bits for LTE)
  const sector = num & 0xff;
  return `${cellId}\n(S:${sector})`;
}

type WifiProps = {
  ssid?: string | null;
};

export function WifiCard({ ssid }: WifiProps) {
  return (
    <View style={[styles.card, { flex: 1, borderColor: "#3B82F6", borderWidth: 1.5 }]}>
      <View style={styles.cardHeader}>
        <Text style={styles.simTitle}>WiFi</Text>
        <View style={[styles.networkBadge, { backgroundColor: "#3B82F6" }]}>
          <Text style={styles.networkBadgeText}>WiFi</Text>
        </View>
      </View>
      <Text style={styles.operator}>{ssid ? `WiFi: ${ssid}` : "Connected via WiFi"}</Text>
      <Text style={styles.subtitle}>NO CELLULAR DATA</Text>
      <Text style={styles.noSimHint}>
        No SIM card detected or mobile data is disabled.{"\n"}
        Showing WiFi connection mode.{"\n"}
        Tower visualization unavailable.
      </Text>
    </View>
  );
}


const styles = StyleSheet.create({
  card: {
    backgroundColor: "#0B1B26",
    borderColor: "#1C3544",
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    padding: 10,
  },
  cardEmpty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
  },
  cardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  simTitle: {
    color: "#778899",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  networkBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  networkBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
  },
  operator: {
    color: "#F7FBFF",
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 2,
  },
  subtitle: {
    color: "#5A7A8A",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 8,
  },
  noSim: {
    color: "#778899",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 8,
  },
  noSimHint: {
    color: "#4A6070",
    fontSize: 10,
    lineHeight: 16,
    marginTop: 6,
    textAlign: "center",
  },
  metricsGrid: {
    flexDirection: "row",
    gap: 6,
  },
  metricsCol: {
    flex: 1,
    gap: 4,
  },
  metricRow: {
    backgroundColor: "#081520",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  metricLabel: {
    color: "#5A7A8A",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  metricValue: {
    color: "#D7E1EA",
    fontSize: 11,
    fontWeight: "900",
    marginTop: 1,
  },
});
