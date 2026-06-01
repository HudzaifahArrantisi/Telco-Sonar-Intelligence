import Slider from "@react-native-community/slider";
import { StyleSheet, Switch, Text, View } from "react-native";
import { PrimaryButton } from "@/components/PrimaryButton";
import { clearLogs, exportLogsCsv } from "@/storage/logStore";
import { Settings } from "@/types/telephony";

type Props = {
  settings: Settings;
  onChange: (settings: Settings) => void;
};

export function SettingsScreen({ settings, onChange }: Props) {
  const update = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Settings</Text>
      <SettingSlider
        label={`Update interval ${settings.updateIntervalSeconds}s`}
        value={settings.updateIntervalSeconds}
        min={5}
        max={60}
        step={5}
        onChange={(value) => update({ updateIntervalSeconds: Math.round(value) })}
      />
      <SettingSlider
        label={`Default beamwidth ${settings.defaultBeamwidth} deg`}
        value={settings.defaultBeamwidth}
        min={30}
        max={120}
        step={1}
        onChange={(value) => update({ defaultBeamwidth: Math.round(value) })}
      />
      <SettingSlider
        label={`Default radius ${settings.defaultRadius}m`}
        value={settings.defaultRadius}
        min={100}
        max={5000}
        step={100}
        onChange={(value) => update({ defaultRadius: Math.round(value) })}
      />
      <View style={styles.toggle}>
        <View>
          <Text style={styles.label}>Enable logging</Text>
          <Text style={styles.help}>Automatically save registered cell and GPS during polling.</Text>
        </View>
        <Switch
          value={settings.loggingEnabled}
          onValueChange={(value) => update({ loggingEnabled: value })}
          trackColor={{ true: "#0FB9A8", false: "#334A58" }}
          thumbColor="#F7FBFF"
        />
      </View>
      <View style={styles.toggle}>
        <View>
          <Text style={styles.label}>Theme mode</Text>
          <Text style={styles.help}>Dark mode is optimized for field engineering work.</Text>
        </View>
        <Text style={styles.value}>{settings.themeMode}</Text>
      </View>
      <View style={styles.actions}>
        <PrimaryButton title="Export Logs" onPress={() => void exportLogsCsv()} />
        <PrimaryButton title="Clear Logs" tone="danger" onPress={() => void clearLogs()} />
      </View>
    </View>
  );
}

function SettingSlider({
  label,
  value,
  min,
  max,
  step,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.block}>
      <Text style={styles.label}>{label}</Text>
      <Slider
        value={value}
        minimumValue={min}
        maximumValue={max}
        step={step}
        onValueChange={onChange}
        minimumTrackTintColor="#40E0C9"
        maximumTrackTintColor="#334A58"
        thumbTintColor="#F7FBFF"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#061017", flex: 1, gap: 16, padding: 16 },
  title: { color: "#F7FBFF", fontSize: 24, fontWeight: "900" },
  block: { backgroundColor: "#0C1A24", borderColor: "#183341", borderRadius: 8, borderWidth: 1, padding: 14 },
  label: { color: "#F7FBFF", fontSize: 14, fontWeight: "800" },
  help: { color: "#8795A6", fontSize: 12, marginTop: 4, maxWidth: 230 },
  toggle: {
    alignItems: "center",
    backgroundColor: "#0C1A24",
    borderColor: "#183341",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 14
  },
  value: { color: "#40E0C9", fontWeight: "900" },
  actions: { gap: 10 }
});
