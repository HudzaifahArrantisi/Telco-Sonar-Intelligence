import Slider from "@react-native-community/slider";
import { StyleSheet, Switch, Text, View } from "react-native";
import { PrimaryButton } from "@/components/PrimaryButton";
import { clearLogs, exportLogsCsv } from "@/storage/logStore";
import { HUD } from "@/theme/hud";
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
          trackColor={{ true: HUD.colors.cyan, false: HUD.colors.border }}
          thumbColor={settings.loggingEnabled ? HUD.colors.bg : HUD.colors.text}
        />
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
        minimumTrackTintColor={HUD.colors.cyan}
        maximumTrackTintColor={HUD.colors.border}
        thumbTintColor={HUD.colors.amber}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: HUD.colors.bg, flex: 1, gap: 16, padding: 16 },
  title: { color: HUD.colors.text, fontSize: 24, fontWeight: "900" },
  block: {
    ...HUD.glow.panel,
    backgroundColor: HUD.colors.panel,
    borderColor: HUD.colors.border,
    borderRadius: HUD.radius,
    borderWidth: 1,
    padding: 14
  },
  label: { color: HUD.colors.text, fontSize: 14, fontWeight: "800" },
  help: { color: HUD.colors.textMuted, fontSize: 12, marginTop: 4, maxWidth: 230 },
  toggle: {
    ...HUD.glow.panel,
    alignItems: "center",
    backgroundColor: HUD.colors.panel,
    borderColor: HUD.colors.border,
    borderRadius: HUD.radius,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 14
  },
  value: { color: HUD.colors.cyan, fontFamily: HUD.fonts.mono, fontWeight: "900" },
  actions: { gap: 10 }
});
