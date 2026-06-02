import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "@/components/PrimaryButton";
import { clearLogs, exportLogsCsv, getLogs } from "@/storage/logStore";
import { HUD } from "@/theme/hud";
import { DriveLog } from "@/types/telephony";
import { formatValue } from "@/utils/signal";

export function DriveLogScreen() {
  const [logs, setLogs] = useState<DriveLog[]>([]);
  const [exportPath, setExportPath] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLogs(await getLogs());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Drive Test Log</Text>
        <PrimaryButton title="Export CSV" icon={<Ionicons name="download" size={16} color={HUD.colors.text} />} onPress={() => void exportLogsCsv().then(setExportPath)} />
      </View>
      {exportPath ? <Text style={styles.path}>CSV saved: {exportPath}</Text> : null}
      <View style={styles.actions}>
        <PrimaryButton title="Refresh" tone="secondary" onPress={() => void refresh()} />
        <PrimaryButton
          title="Clear Logs"
          tone="danger"
          onPress={() => void clearLogs().then(refresh)}
        />
      </View>
      <FlatList
        data={logs}
        keyExtractor={(item, index) => `${item.id ?? item.timestamp}-${index}`}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowTitle}>
              {item.operator} | {item.networkType} | {new Date(item.timestamp).toLocaleString()}
            </Text>
            <Text style={styles.rowText}>
              Cell {formatValue(item.cellId)} | TAC {formatValue(item.tac)} | PCI {formatValue(item.pci)} | {formatValue(item.band)}
            </Text>
            <Text style={styles.rowText}>
              RSRP {formatValue(item.rsrp, " dBm")} | RSRQ {formatValue(item.rsrq, " dB")} | SINR {formatValue(item.sinr, " dB")}
            </Text>
            <Text style={styles.rowText}>
              GPS {formatValue(item.latitude)}, {formatValue(item.longitude)}
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No local drive-test logs yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: HUD.colors.bg, flex: 1, padding: 16 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  title: { color: HUD.colors.text, fontSize: 24, fontWeight: "900" },
  actions: { flexDirection: "row", gap: 10, marginVertical: 12 },
  list: { gap: 10, paddingBottom: 32 },
  row: {
    ...HUD.glow.panel,
    backgroundColor: HUD.colors.panel,
    borderColor: HUD.colors.border,
    borderRadius: HUD.radius,
    borderWidth: 1,
    padding: 12
  },
  rowTitle: { color: HUD.colors.phosphor, fontFamily: HUD.fonts.mono, fontSize: 13, fontWeight: "800" },
  rowText: { color: HUD.colors.phosphor, fontFamily: HUD.fonts.mono, fontSize: 12, lineHeight: 18, marginTop: 3 },
  empty: { color: HUD.colors.phosphor, fontFamily: HUD.fonts.mono, marginTop: 24, textAlign: "center" },
  path: { color: HUD.colors.phosphor, fontFamily: HUD.fonts.mono, fontSize: 12, marginTop: 12 }
});
