import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Disclaimer } from "@/components/Disclaimer";
import { MetricCard } from "@/components/MetricCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SignalBadge } from "@/components/SignalBadge";
import { readCells, readLocation, saveCurrentLog } from "@/services/telephonyService";
import { Settings, TelephonyCell, LocationPoint } from "@/types/telephony";
import { formatValue, getSignalStatus } from "@/utils/signal";

type Props = {
  settings: Settings;
  onCells: (cells: TelephonyCell[], location: LocationPoint | null) => void;
};

export function DashboardScreen({ settings, onCells }: Props) {
  const [cells, setCells] = useState<TelephonyCell[]>([]);
  const [location, setLocation] = useState<LocationPoint | null>(null);
  const [monitoring, setMonitoring] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const primaryCell = useMemo(() => cells.find((cell) => cell.isRegistered) ?? cells[0], [cells]);
  const status = getSignalStatus(primaryCell);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const [nextCells, nextLocation] = await Promise.all([readCells(), readLocation()]);
      setCells(nextCells);
      setLocation(nextLocation);
      onCells(nextCells, nextLocation);
      const registered = nextCells.find((cell) => cell.isRegistered) ?? nextCells[0];
      if (registered && settings.loggingEnabled) {
        await saveCurrentLog(registered, nextLocation);
      }
      if (nextCells.length === 0) {
        setError("Android tidak mengembalikan CellInfo. Pastikan perangkat asli, SIM aktif, dan izin lokasi/phone state aktif.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gagal membaca data telephony.");
    }
  }, [onCells, settings.loggingEnabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!monitoring) {
      if (timer.current) clearInterval(timer.current);
      return;
    }
    timer.current = setInterval(() => void refresh(), settings.updateIntervalSeconds * 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [monitoring, refresh, settings.updateIntervalSeconds]);

  async function saveLog() {
    if (primaryCell) await saveCurrentLog(primaryCell, location);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>RF ENGINEERING DASHBOARD</Text>
          <Text style={styles.title}>Telco RF Monitor</Text>
        </View>
        <SignalBadge status={status} />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Animated.View entering={FadeInDown.duration(280)} style={styles.hero}>
        <View>
          <Text style={styles.operator}>{primaryCell?.operatorName ?? "No SIM / No CellInfo"}</Text>
          <Text style={styles.network}>
            {formatValue(primaryCell?.networkType)} | MCC/MNC {formatValue(primaryCell?.mcc)}/{formatValue(primaryCell?.mnc)}
          </Text>
        </View>
        <Ionicons name="cellular" size={34} color="#40E0C9" />
      </Animated.View>

      <View style={styles.grid}>
        <MetricCard label="Cell ID" value={formatValue(primaryCell?.cellId)} />
        <MetricCard label="TAC / LAC" value={formatValue(primaryCell?.tac ?? primaryCell?.lac)} />
        <MetricCard label="PCI" value={formatValue(primaryCell?.pci)} />
        <MetricCard label="EARFCN / NRARFCN" value={formatValue(primaryCell?.earfcn ?? primaryCell?.nrarfcn)} />
        <MetricCard label="Band" value={formatValue(primaryCell?.band)} accent="#9AE66E" />
        <MetricCard label="RSRP" value={formatValue(primaryCell?.rsrp, " dBm")} accent="#40E0C9" />
        <MetricCard label="RSRQ" value={formatValue(primaryCell?.rsrq, " dB")} accent="#FFB84D" />
        <MetricCard label="RSSI" value={formatValue(primaryCell?.rssi, " dBm")} accent="#9FB4FF" />
        <MetricCard label="SINR" value={formatValue(primaryCell?.sinr, " dB")} accent="#9AE66E" />
        <MetricCard
          label="Last Update"
          value={primaryCell ? new Date(primaryCell.timestamp).toLocaleTimeString() : "N/A"}
        />
      </View>

      <View style={styles.actions}>
        <PrimaryButton title="Start Monitoring" onPress={() => setMonitoring(true)} />
        <PrimaryButton title="Stop Monitoring" tone="secondary" onPress={() => setMonitoring(false)} />
        <PrimaryButton title="Refresh Now" tone="secondary" onPress={() => void refresh()} />
        <PrimaryButton title="Save Log" tone="secondary" onPress={() => void saveLog()} />
      </View>

      <View style={styles.simBlock}>
        <Text style={styles.sectionTitle}>SIM / Registered Cells</Text>
        {cells.map((cell, index) => (
          <Text key={`${cell.simSlot}-${cell.cellId}-${index}`} style={styles.simLine}>
            SIM {cell.simSlot + 1}: {cell.operatorName || "Unknown"} | {cell.networkType} | Cell {formatValue(cell.cellId)}{" "}
            {cell.isRegistered ? "| registered" : "| neighbor/observed"}
          </Text>
        ))}
      </View>
      <Disclaimer />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#061017", flex: 1 },
  content: { gap: 16, padding: 16, paddingBottom: 32 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  kicker: { color: "#40E0C9", fontSize: 11, fontWeight: "900" },
  title: { color: "#F7FBFF", fontSize: 26, fontWeight: "900", marginTop: 4 },
  hero: {
    alignItems: "center",
    backgroundColor: "#0C1A24",
    borderColor: "#183341",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 18
  },
  operator: { color: "#F7FBFF", fontSize: 24, fontWeight: "900" },
  network: { color: "#AAB7C4", fontSize: 13, marginTop: 6 },
  error: { backgroundColor: "#321820", borderRadius: 8, color: "#FFACB6", padding: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actions: { gap: 10 },
  simBlock: { backgroundColor: "#091722", borderRadius: 8, gap: 8, padding: 14 },
  sectionTitle: { color: "#F7FBFF", fontSize: 15, fontWeight: "800" },
  simLine: { color: "#B9C4CF", fontSize: 12, lineHeight: 18 }
});
