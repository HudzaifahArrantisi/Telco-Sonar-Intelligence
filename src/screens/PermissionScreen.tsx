import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "@/components/PrimaryButton";
import { HUD } from "@/theme/hud";

export function PermissionScreen({ onRequest }: { onRequest: () => void }) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="radio-outline" size={42} color={HUD.colors.cyan} />
      </View>
      <Text style={styles.title}>Telco RF Monitor</Text>
      <Text style={styles.body}>
        Aplikasi membutuhkan izin lokasi dan phone state untuk membaca CellInfo Android, mengikat data RF ke GPS, dan
        membuat log drive test lokal.
      </Text>
      <View style={styles.list}>
        <Text style={styles.item}>Location: GPS marker, sector estimate, drive-test coordinates.</Text>
        <Text style={styles.item}>Phone State: operator, RAT, cell identity, PCI, TAC/LAC, and signal metrics.</Text>
      </View>
      <PrimaryButton title="Grant Permissions" onPress={onRequest} />
      <Text style={styles.note}>
        Jika izin ditolak, Android akan mengembalikan data kosong atau membatasi parameter radio tertentu.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: HUD.colors.bg,
    flex: 1,
    justifyContent: "center",
    padding: 24
  },
  iconWrap: {
    ...HUD.glow.cyan,
    alignItems: "center",
    backgroundColor: HUD.colors.panel,
    borderColor: HUD.colors.border,
    borderRadius: HUD.radius,
    borderWidth: 1,
    height: 74,
    justifyContent: "center",
    marginBottom: 22,
    width: 74
  },
  title: {
    color: HUD.colors.text,
    fontSize: 31,
    fontWeight: "900",
    letterSpacing: 0
  },
  body: {
    color: HUD.colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12
  },
  list: {
    gap: 10,
    marginVertical: 22
  },
  item: {
    color: HUD.colors.text,
    fontSize: 13,
    lineHeight: 19
  },
  note: {
    color: HUD.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 16
  }
});
