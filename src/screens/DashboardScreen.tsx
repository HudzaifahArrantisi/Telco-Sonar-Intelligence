import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import WebView from "react-native-webview";
import { Disclaimer } from "@/components/Disclaimer";
import { MetricCard } from "@/components/MetricCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SignalBadge } from "@/components/SignalBadge";
import { initialRfIntelligenceState, RfIntelligenceState, updateRfIntelligence } from "@/maps/rfIntelligence";
import { readCells, readLocation, saveCurrentLog } from "@/services/telephonyService";
import { HUD } from "@/theme/hud";
import { Settings, TelephonyCell, LocationPoint } from "@/types/telephony";
import { formatValue, getSignalStatus } from "@/utils/signal";

type Props = {
  settings: Settings;
  onCells: (cells: TelephonyCell[], location: LocationPoint | null) => void;
};

type TerminalLevel = "I" | "W" | "E";

type TerminalLogLine = {
  id: string;
  level: TerminalLevel;
  tag: string;
  message: string;
  timestamp: number;
};

const MAX_TERMINAL_LINES = 80;

type SignalHealth = {
  score: number;
  label: string;
  color: string;
  activityIcon: string;
  activityText: string;
};

export function DashboardScreen({ settings, onCells }: Props) {
  const [cells, setCells] = useState<TelephonyCell[]>([]);
  const [location, setLocation] = useState<LocationPoint | null>(null);
  const [monitoring, setMonitoring] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [compassHeading, setCompassHeading] = useState<number | null>(null);
  const [compassError, setCompassError] = useState(false);
  const [beepEnabled, setBeepEnabled] = useState(false);
  const [rfState, setRfState] = useState<RfIntelligenceState>(() => initialRfIntelligenceState());
  const [terminalLogs, setTerminalLogs] = useState<TerminalLogLine[]>(() => [
    {
      id: `boot-${Date.now()}`,
      level: "I",
      tag: "RfMonitor",
      message: "live RF terminal attached; filter style: adb logcat *:E",
      timestamp: Date.now()
    }
  ]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const terminalScrollRef = useRef<ScrollView | null>(null);
  const beepWebViewRef = useRef<WebView | null>(null);
  const terminalSequence = useRef(1);
  const primaryCell = useMemo(() => cells.find((cell) => cell.isRegistered) ?? cells[0], [cells]);
  const sim1Primary = useMemo(() => primaryCellForSlot(cells, 0), [cells]);
  const sim2Primary = useMemo(() => primaryCellForSlot(cells, 1), [cells]);
  const status = getSignalStatus(primaryCell);
  const signalHealth = useMemo(() => getSignalHealth(primaryCell?.rsrp), [primaryCell?.rsrp]);
  const beepIntervalMs = beepIntervalForRsrp(primaryCell?.rsrp);
  const activeTower = primaryCell?.simSlot === 1 ? rfState.towerSim2 : rfState.towerSim1;
  const towerBearing = useMemo(
    () => (location && activeTower ? bearingBetween(location, activeTower.location) : null),
    [activeTower, location]
  );
  const relativeTowerBearing =
    towerBearing !== null && compassHeading !== null ? normalizeDegrees(towerBearing - compassHeading) : null;

  const appendTerminalLog = useCallback((level: TerminalLevel, tag: string, message: string) => {
    const timestamp = Date.now();
    const sequence = terminalSequence.current;
    terminalSequence.current += 1;
    setTerminalLogs((current) =>
      [
        ...current,
        {
          id: `${timestamp}-${level}-${sequence}`,
          level,
          tag,
          message,
          timestamp
        }
      ].slice(-MAX_TERMINAL_LINES)
    );
  }, []);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const [nextCells, nextLocation] = await Promise.all([readCells(), readLocation()]);
      setCells(nextCells);
      setLocation(nextLocation);
      onCells(nextCells, nextLocation);
      setRfState((previous) =>
        updateRfIntelligence(previous, nextCells, nextLocation, settings.defaultRadius, settings.defaultBeamwidth)
      );
      const registered = nextCells.find((cell) => cell.isRegistered) ?? nextCells[0];
      if (registered && settings.loggingEnabled) {
        await saveCurrentLog(registered, nextLocation);
      }
      if (nextCells.length === 0) {
        const message = "Android tidak mengembalikan CellInfo. Pastikan perangkat asli, SIM aktif, dan izin lokasi/phone state aktif.";
        setError(message);
        appendTerminalLog("W", "CellInfo", message);
      } else if (registered) {
        appendTerminalLog(
          "I",
          "CellInfo",
          formatCellLogMessage(registered, nextCells.length, settings.loggingEnabled, nextLocation)
        );
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Gagal membaca data telephony.";
      setError(message);
      appendTerminalLog("E", "TelephonyModule", message);
    }
  }, [appendTerminalLog, onCells, settings.defaultBeamwidth, settings.defaultRadius, settings.loggingEnabled]);

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

  useEffect(() => {
    let subscription: { remove: () => void } | null = null;
    let mounted = true;
    void Location.watchHeadingAsync((heading) => {
      if (!mounted) return;
      const nextHeading = heading.trueHeading >= 0 ? heading.trueHeading : heading.magHeading;
      if (typeof nextHeading === "number" && nextHeading >= 0) {
        setCompassHeading(nextHeading);
        setCompassError(false);
      }
    })
      .then((nextSubscription) => {
        subscription = nextSubscription;
      })
      .catch(() => {
        if (mounted) setCompassError(true);
      });
    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, []);

  useEffect(() => {
    beepWebViewRef.current?.injectJavaScript(
      `window.setBeepTracker(${JSON.stringify({ enabled: beepEnabled, intervalMs: beepIntervalMs })}); true;`
    );
  }, [beepEnabled, beepIntervalMs]);

  async function saveLog() {
    if (primaryCell) await saveCurrentLog(primaryCell, location);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <WebView
        ref={beepWebViewRef}
        source={{ html: BEEP_SYNTH_HTML }}
        javaScriptEnabled
        mediaPlaybackRequiresUserAction={false}
        style={styles.beepSynth}
      />
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>RF ENGINEERING DASHBOARD</Text>
          <Text style={styles.title}>Telco Sonar Monitor</Text>
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
        <SignalBars score={signalHealth.score} color={signalHealth.color} />
      </Animated.View>

      <DualSimBattleCard sim1={sim1Primary} sim2={sim2Primary} />

      <View style={styles.tacticalRow}>
        <View style={styles.compassPanel}>
          <Text style={styles.panelEyebrow}>TACTICAL HUD COMPASS</Text>
          <View style={styles.compassDial}>
            <Text style={[styles.compassTick, styles.compassNorth]}>N</Text>
            <Text style={[styles.compassTick, styles.compassEast]}>E</Text>
            <Text style={[styles.compassTick, styles.compassSouth]}>S</Text>
            <Text style={[styles.compassTick, styles.compassWest]}>W</Text>
            {relativeTowerBearing !== null && !compassError ? (
              <View style={[styles.compassNeedle, { transform: [{ rotate: `${relativeTowerBearing}deg` }] }]}>
                <View style={styles.compassNeedleTip} />
                <View style={styles.compassNeedleTail} />
              </View>
            ) : (
              <Text style={styles.compassFallback}>SENSOR LOKASI/KOMPAS TIDAK AKTIF</Text>
            )}
          </View>
          <Text style={styles.compassMeta}>
            {relativeTowerBearing !== null && !compassError
              ? `Bearing BTS ${Math.round(towerBearing ?? 0)} deg | Heading ${Math.round(compassHeading ?? 0)} deg`
              : "Butuh GPS, kompas, dan estimasi BTS aktif."}
          </Text>
        </View>

        <View style={styles.beepPanel}>
          <Text style={styles.panelEyebrow}>GEIGER AUDIO FINDER</Text>
          <Pressable
            onPress={() => setBeepEnabled((value) => !value)}
            style={[styles.beepToggle, beepEnabled && styles.beepToggleActive]}
          >
            <Ionicons name={beepEnabled ? "volume-high" : "volume-mute"} size={22} color={beepEnabled ? "#39FF14" : HUD.colors.textMuted} />
            <Text style={styles.beepToggleText}>{beepEnabled ? "BEEP ON" : "BEEP OFF"}</Text>
          </Pressable>
          <Text style={styles.beepMeta}>Interval {beepIntervalMs}ms berdasarkan RSRP aktif.</Text>
        </View>
      </View>

      <View style={styles.healthPanel}>
        <View style={styles.healthHeader}>
          <View>
            <Text style={styles.healthTitle}>Signal Health Score</Text>
            <Text style={[styles.healthLabel, { color: signalHealth.color }]}>{signalHealth.label}</Text>
          </View>
          <Text style={[styles.healthScore, { color: signalHealth.color }]}>{signalHealth.score}%</Text>
        </View>
        <View style={styles.scoreTrack}>
          <View style={[styles.scoreFill, { backgroundColor: signalHealth.color, width: `${signalHealth.score}%` }]} />
        </View>
        <Text style={styles.healthHint}>Dihitung dari kekuatan RSRP SIM aktif.</Text>
      </View>

      <View style={[styles.activityCard, { borderColor: signalHealth.color }]}>
        <Text style={styles.activityIcon}>{signalHealth.activityIcon}</Text>
        <Text style={styles.activityText}>{signalHealth.activityText}</Text>
      </View>

      <View style={styles.grid}>
        <MetricCard label="Cell ID" description="ID Unik Pemancar BTS" value={formatValue(primaryCell?.cellId)} />
        <MetricCard label="TAC / LAC" description="Kode Area Jaringan" value={formatValue(primaryCell?.tac ?? primaryCell?.lac)} />
        <MetricCard label="PCI" description="ID Fisik Sinyal Terdekat" value={formatValue(primaryCell?.pci)} />
        <MetricCard label="EARFCN / NRARFCN" value={formatValue(primaryCell?.earfcn ?? primaryCell?.nrarfcn)} />
        <MetricCard label="Band" description="Pita Frekuensi Jaringan" value={formatValue(primaryCell?.band)} accent={HUD.colors.amber} />
        <MetricCard label="RSRP" description="Kekuatan Sinyal Murni" value={formatValue(primaryCell?.rsrp, " dBm")} accent={signalHealth.color} />
        <MetricCard label="RSRQ" value={formatValue(primaryCell?.rsrq, " dB")} accent={HUD.colors.amber} />
        <MetricCard label="RSSI" value={formatValue(primaryCell?.rssi, " dBm")} accent={HUD.colors.text} />
        <MetricCard label="SINR" description="Tingkat Kebersihan Sinyal" value={formatValue(primaryCell?.sinr, " dB")} accent={HUD.colors.cyan} />
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

      <View style={styles.terminalBlock}>
        <View style={styles.terminalHeader}>
          <View style={styles.terminalTitleRow}>
            <Ionicons name="terminal" size={15} color={HUD.colors.cyan} />
            <Text style={styles.terminalTitle}>LIVE LOGCAT</Text>
          </View>
          <Text style={styles.terminalFilter}>*:E style</Text>
        </View>
        <ScrollView
          ref={terminalScrollRef}
          style={styles.terminalViewport}
          contentContainerStyle={styles.terminalContent}
          nestedScrollEnabled
          onContentSizeChange={() => terminalScrollRef.current?.scrollToEnd({ animated: true })}
        >
          {terminalLogs.map((line) => (
            <Text key={line.id} style={[styles.terminalLine, line.level === "E" && styles.terminalLineError, line.level === "W" && styles.terminalLineWarn]}>
              {formatLogcatLine(line)}
            </Text>
          ))}
        </ScrollView>
      </View>
      <Disclaimer />
    </ScrollView>
  );
}

function formatCellLogMessage(
  cell: TelephonyCell,
  cellCount: number,
  loggingEnabled: boolean,
  location: LocationPoint | null
): string {
  const gps = location
    ? `gps=${location.latitude.toFixed(5)},${location.longitude.toFixed(5)} acc=${formatValue(Math.round(location.accuracy ?? 0), "m")}`
    : "gps=N/A";
  const dbm = [
    `rsrp=${formatValue(cell.rsrp, "dBm")}`,
    `rsrq=${formatValue(cell.rsrq, "dB")}`,
    `sinr=${formatValue(cell.sinr, "dB")}`,
    `ta=${formatValue(cell.timingAdvance)}`
  ].join(" ");
  return `cells=${cellCount} sim=${cell.simSlot + 1} ${cell.operatorName || "Unknown"} ${cell.networkType} cell=${formatValue(cell.cellId)} pci=${formatValue(cell.pci)} ${dbm} ${gps} sqlite=${loggingEnabled ? "write" : "off"}`;
}

function formatLogcatLine(line: TerminalLogLine): string {
  return `${formatLogTime(line.timestamp)} ${line.level}/${line.tag}( ${processIdForTag(line.tag)}): ${line.message}`;
}

function formatLogTime(timestamp: number): string {
  const value = new Date(timestamp);
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const date = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  const seconds = String(value.getSeconds()).padStart(2, "0");
  const millis = String(value.getMilliseconds()).padStart(3, "0");
  return `${month}-${date} ${hours}:${minutes}:${seconds}.${millis}`;
}

function processIdForTag(tag: string): string {
  let seed = 2400;
  for (let index = 0; index < tag.length; index += 1) {
    seed += tag.charCodeAt(index);
  }
  return String(seed).padStart(5, " ");
}

function getSignalHealth(rsrp?: number | null): SignalHealth {
  const score = scoreFromRsrp(rsrp);
  if (score >= 90) {
    return {
      score,
      label: "SANGAT KUAT & STABIL",
      color: "#39FF14",
      activityIcon: "🎮",
      activityText: "Sangat lancar untuk bermain Game Online bebas lag dan Streaming Video 4K."
    };
  }
  if (score >= 70) {
    return {
      score,
      label: "BAIK / STABIL",
      color: "#20E070",
      activityIcon: "🎮",
      activityText: "Sangat lancar untuk bermain Game Online bebas lag dan Streaming Video 4K."
    };
  }
  if (score >= 40) {
    return {
      score,
      label: "SEDANG / CUKUP",
      color: "#FFB000",
      activityIcon: "📱",
      activityText: "Lancar untuk sosmed dan browsing, namun sedikit buffering pada video HD."
    };
  }
  return {
    score,
    label: "BURUK / LEMAH",
    color: "#FF4D4D",
    activityIcon: "⚠",
    activityText: "Sinyal lemah. Koneksi lambat dan panggilan suara berpotensi putus-putus."
  };
}

function scoreFromRsrp(rsrp?: number | null): number {
  if (typeof rsrp !== "number") return 0;
  if (rsrp >= -85) return clampScore(90 + ((rsrp + 85) / 10) * 10);
  if (rsrp >= -95) return clampScore(70 + ((rsrp + 95) / 10) * 19);
  if (rsrp >= -105) return clampScore(40 + ((rsrp + 105) / 10) * 29);
  return clampScore(((rsrp + 120) / 15) * 39);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function SignalBars({ score, color }: { score: number; color: string }) {
  const activeBars = score <= 0 ? 0 : Math.max(1, Math.ceil(score / 20));
  return (
    <View style={styles.signalBars} accessibilityLabel={`Signal level ${activeBars} dari 5`}>
      {[14, 20, 26, 32, 38].map((height, index) => {
        const active = index < activeBars;
        return (
          <View
            key={height}
            style={[
              styles.signalBar,
              {
                backgroundColor: active ? color : HUD.colors.panelSoft,
                borderColor: active ? color : HUD.colors.border,
                height,
                shadowColor: color,
                shadowOpacity: active ? 0.45 : 0
              }
            ]}
          />
        );
      })}
    </View>
  );
}

function DualSimBattleCard({ sim1, sim2 }: { sim1: TelephonyCell | null; sim2: TelephonyCell | null }) {
  const sim1Score = scoreFromRsrp(sim1?.rsrp);
  const sim2Score = scoreFromRsrp(sim2?.rsrp);
  const recommendedSlot = sim1Score === 0 && sim2Score === 0 ? null : sim1Score >= sim2Score ? 0 : 1;
  return (
    <View style={styles.battlePanel}>
      <View style={styles.battleHeader}>
        <Text style={styles.panelEyebrow}>OPERATOR BATTLE CARD</Text>
        <Text style={styles.battleHint}>REKOMENDASI DATA OTOMATIS</Text>
      </View>
      <View style={styles.battleCards}>
        <SimBattleSide cell={sim1} slot={0} score={sim1Score} recommended={recommendedSlot === 0} />
        <SimBattleSide cell={sim2} slot={1} score={sim2Score} recommended={recommendedSlot === 1} />
      </View>
    </View>
  );
}

function SimBattleSide({
  cell,
  slot,
  score,
  recommended
}: {
  cell: TelephonyCell | null;
  slot: number;
  score: number;
  recommended: boolean;
}) {
  const color = recommended ? "#FFD700" : HUD.colors.border;
  return (
    <View style={[styles.battleSide, recommended && styles.battleSideRecommended]}>
      <View style={styles.battleTopLine}>
        <View style={styles.operatorLogo}>
          <Text style={styles.operatorLogoText}>{operatorInitials(cell?.operatorName, slot)}</Text>
        </View>
        {recommended ? <Text style={styles.recommendedBadge}>RECOMMENDED DATA</Text> : null}
      </View>
      <Text style={styles.simSlotLabel}>SIM {slot + 1}</Text>
      <Text style={styles.battleOperator} numberOfLines={1}>
        {cell?.operatorName || "NO SIM"}
      </Text>
      <Text style={styles.battleRadio}>{formatValue(cell?.networkType)}</Text>
      <View style={styles.battleMetrics}>
        <Text style={styles.battleValue}>{formatValue(cell?.rsrp, " dBm")}</Text>
        <Text style={[styles.battleScore, { color }]}>{score}%</Text>
      </View>
      <SignalBars score={score} color={recommended ? "#FFD700" : HUD.colors.text} />
    </View>
  );
}

function primaryCellForSlot(cells: TelephonyCell[], simSlot: number): TelephonyCell | null {
  const slotCells = cells.filter((cell) => cell.simSlot === simSlot);
  return slotCells.find((cell) => cell.isRegistered) ?? slotCells[0] ?? null;
}

function beepIntervalForRsrp(rsrp?: number | null): number {
  if (typeof rsrp !== "number") return 1500;
  if (rsrp >= -85) return 100;
  if (rsrp >= -95) return 300;
  if (rsrp >= -105) return 700;
  return 1500;
}

function bearingBetween(from: LocationPoint, to: LocationPoint): number {
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const deltaLon = ((to.longitude - from.longitude) * Math.PI) / 180;
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  return normalizeDegrees((Math.atan2(y, x) * 180) / Math.PI);
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function operatorInitials(operatorName: string | undefined, slot: number): string {
  if (!operatorName) return `S${slot + 1}`;
  const compact = operatorName.replace(/[^a-zA-Z0-9]/g, "").slice(0, 3);
  return compact ? compact.toUpperCase() : `S${slot + 1}`;
}

const BEEP_SYNTH_HTML = `
<!doctype html>
<html>
<body>
  <script>
    let audioContext = null;
    let timer = null;

    function beep() {
      try {
        audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === "suspended") audioContext.resume();
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = "square";
        oscillator.frequency.value = 1760;
        gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.07);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.08);
      } catch (error) {}
    }

    window.setBeepTracker = function(config) {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (!config || !config.enabled) return;
      beep();
      timer = setInterval(beep, Math.max(80, config.intervalMs || 1500));
    };
  <\/script>
</body>
</html>
`;

const styles = StyleSheet.create({
  screen: { backgroundColor: HUD.colors.bg, flex: 1 },
  beepSynth: { height: 1, opacity: 0, position: "absolute", width: 1 },
  content: { gap: 16, padding: 16, paddingBottom: 32 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  kicker: { color: HUD.colors.amber, fontSize: 11, fontWeight: "900" },
  title: { color: HUD.colors.text, fontSize: 26, fontWeight: "900", marginTop: 4 },
  hero: {
    ...HUD.glow.cyan,
    alignItems: "center",
    backgroundColor: HUD.colors.panel,
    borderColor: HUD.colors.border,
    borderRadius: HUD.radius,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 18
  },
  operator: { color: HUD.colors.text, fontSize: 24, fontWeight: "900" },
  network: { color: HUD.colors.textMuted, fontFamily: HUD.fonts.mono, fontSize: 13, marginTop: 6 },
  battlePanel: {
    ...HUD.glow.panel,
    backgroundColor: HUD.colors.panel,
    borderColor: HUD.colors.border,
    borderRadius: HUD.radius,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  battleHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10
  },
  panelEyebrow: {
    color: "#00F0FF",
    fontFamily: HUD.fonts.mono,
    fontSize: 10,
    fontWeight: "900"
  },
  battleHint: {
    color: HUD.colors.textMuted,
    fontSize: 9,
    fontWeight: "800"
  },
  battleCards: {
    flexDirection: "row",
    gap: 8
  },
  battleSide: {
    backgroundColor: HUD.colors.bgAlt,
    borderColor: HUD.colors.border,
    borderRadius: HUD.radius,
    borderWidth: 1,
    flex: 1,
    gap: 7,
    padding: 10
  },
  battleSideRecommended: {
    borderColor: "#FFD700",
    shadowColor: "#FFD700",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12
  },
  battleTopLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    justifyContent: "space-between"
  },
  operatorLogo: {
    alignItems: "center",
    backgroundColor: HUD.colors.bg,
    borderColor: HUD.colors.borderStrong,
    borderRadius: 999,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34
  },
  operatorLogoText: {
    color: HUD.colors.text,
    fontFamily: HUD.fonts.mono,
    fontSize: 10,
    fontWeight: "900"
  },
  simSlotLabel: {
    color: HUD.colors.textMuted,
    fontFamily: HUD.fonts.mono,
    fontSize: 9,
    fontWeight: "900"
  },
  recommendedBadge: {
    color: "#FFD700",
    fontFamily: HUD.fonts.mono,
    fontSize: 8,
    fontWeight: "900"
  },
  battleOperator: {
    color: HUD.colors.text,
    fontSize: 14,
    fontWeight: "900"
  },
  battleRadio: {
    color: HUD.colors.textMuted,
    fontFamily: HUD.fonts.mono,
    fontSize: 10,
    fontWeight: "800"
  },
  battleMetrics: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  battleValue: {
    color: HUD.colors.phosphor,
    fontFamily: HUD.fonts.mono,
    fontSize: 12,
    fontWeight: "900"
  },
  battleScore: {
    fontFamily: HUD.fonts.mono,
    fontSize: 18,
    fontWeight: "900"
  },
  tacticalRow: {
    flexDirection: "row",
    gap: 10
  },
  compassPanel: {
    ...HUD.glow.cyan,
    backgroundColor: HUD.colors.panel,
    borderColor: HUD.colors.border,
    borderRadius: HUD.radius,
    borderWidth: 1,
    flex: 1,
    gap: 9,
    padding: 12
  },
  compassDial: {
    alignItems: "center",
    alignSelf: "center",
    borderColor: "#00F0FF",
    borderRadius: 74,
    borderWidth: 1,
    height: 148,
    justifyContent: "center",
    overflow: "hidden",
    width: 148
  },
  compassTick: {
    color: "#00F0FF",
    fontFamily: HUD.fonts.mono,
    fontSize: 10,
    fontWeight: "900",
    position: "absolute"
  },
  compassNorth: { top: 8 },
  compassEast: { right: 10 },
  compassSouth: { bottom: 8 },
  compassWest: { left: 10 },
  compassNeedle: {
    alignItems: "center",
    height: 122,
    justifyContent: "space-between",
    position: "absolute",
    width: 18
  },
  compassNeedleTip: {
    borderBottomColor: "#00F0FF",
    borderBottomWidth: 54,
    borderLeftColor: "transparent",
    borderLeftWidth: 8,
    borderRightColor: "transparent",
    borderRightWidth: 8,
    height: 0,
    shadowColor: "#00F0FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    width: 0
  },
  compassNeedleTail: {
    backgroundColor: HUD.colors.textMuted,
    borderRadius: 3,
    height: 42,
    width: 4
  },
  compassFallback: {
    color: HUD.colors.textMuted,
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 15,
    paddingHorizontal: 12,
    textAlign: "center"
  },
  compassMeta: {
    color: HUD.colors.textMuted,
    fontFamily: HUD.fonts.mono,
    fontSize: 10,
    lineHeight: 14
  },
  beepPanel: {
    ...HUD.glow.panel,
    backgroundColor: HUD.colors.panel,
    borderColor: HUD.colors.border,
    borderRadius: HUD.radius,
    borderWidth: 1,
    flex: 1,
    gap: 10,
    justifyContent: "space-between",
    padding: 12
  },
  beepToggle: {
    alignItems: "center",
    backgroundColor: HUD.colors.bgAlt,
    borderColor: HUD.colors.border,
    borderRadius: HUD.radius,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 52
  },
  beepToggleActive: {
    borderColor: "#39FF14",
    shadowColor: "#39FF14",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 12
  },
  beepToggleText: {
    color: HUD.colors.text,
    fontFamily: HUD.fonts.mono,
    fontSize: 12,
    fontWeight: "900"
  },
  beepMeta: {
    color: HUD.colors.textMuted,
    fontFamily: HUD.fonts.mono,
    fontSize: 10,
    lineHeight: 14
  },
  signalBars: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 5,
    height: 42,
    justifyContent: "flex-end",
    minWidth: 74
  },
  signalBar: {
    borderRadius: 3,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    width: 9
  },
  healthPanel: {
    ...HUD.glow.panel,
    backgroundColor: HUD.colors.panel,
    borderColor: HUD.colors.border,
    borderRadius: HUD.radius,
    borderWidth: 1,
    gap: 10,
    padding: 14
  },
  healthHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  healthTitle: {
    color: HUD.colors.text,
    fontSize: 14,
    fontWeight: "900"
  },
  healthLabel: {
    fontSize: 12,
    fontWeight: "900",
    marginTop: 4
  },
  healthScore: {
    fontFamily: HUD.fonts.mono,
    fontSize: 34,
    fontWeight: "900"
  },
  scoreTrack: {
    backgroundColor: HUD.colors.panelSoft,
    borderColor: HUD.colors.border,
    borderRadius: 999,
    borderWidth: 1,
    height: 12,
    overflow: "hidden"
  },
  scoreFill: {
    borderRadius: 999,
    height: "100%"
  },
  healthHint: {
    color: HUD.colors.textMuted,
    fontSize: 11
  },
  activityCard: {
    ...HUD.glow.panel,
    alignItems: "center",
    backgroundColor: HUD.colors.panel,
    borderRadius: HUD.radius,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14
  },
  activityIcon: {
    fontSize: 26,
    width: 32
  },
  activityText: {
    color: HUD.colors.text,
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19
  },
  sweetSpotPanel: {
    ...HUD.glow.panel,
    backgroundColor: HUD.colors.panel,
    borderColor: HUD.colors.border,
    borderRadius: HUD.radius,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  sweetSpotInput: {
    backgroundColor: HUD.colors.bgAlt,
    borderColor: HUD.colors.border,
    borderRadius: HUD.radius,
    borderWidth: 1,
    color: HUD.colors.text,
    fontFamily: HUD.fonts.mono,
    fontSize: 12,
    minHeight: 42,
    paddingHorizontal: 10
  },
  sweetSpotStatus: {
    color: HUD.colors.phosphor,
    fontFamily: HUD.fonts.mono,
    fontSize: 11
  },
  error: {
    backgroundColor: "rgba(255, 122, 0, 0.12)",
    borderColor: HUD.colors.amberStrong,
    borderRadius: HUD.radius,
    borderWidth: 1,
    color: HUD.colors.amber,
    padding: 12
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actions: { gap: 10 },
  simBlock: {
    ...HUD.glow.panel,
    backgroundColor: HUD.colors.panel,
    borderColor: HUD.colors.border,
    borderRadius: HUD.radius,
    borderWidth: 1,
    gap: 8,
    padding: 14
  },
  sectionTitle: { color: HUD.colors.text, fontSize: 15, fontWeight: "800" },
  simLine: { color: HUD.colors.textMuted, fontFamily: HUD.fonts.mono, fontSize: 12, lineHeight: 18 },
  terminalBlock: {
    ...HUD.glow.cyan,
    backgroundColor: HUD.colors.bgAlt,
    borderColor: HUD.colors.border,
    borderRadius: HUD.radius,
    borderWidth: 1,
    overflow: "hidden",
  },
  terminalHeader: {
    alignItems: "center",
    backgroundColor: HUD.colors.panel,
    borderBottomColor: HUD.colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  terminalTitleRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  terminalTitle: { color: HUD.colors.text, fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  terminalFilter: { color: HUD.colors.textMuted, fontSize: 10, fontWeight: "900" },
  terminalViewport: { maxHeight: 220 },
  terminalContent: { gap: 3, padding: 10 },
  terminalLine: {
    color: HUD.colors.phosphor,
    fontFamily: HUD.fonts.mono,
    fontSize: 10,
    lineHeight: 15,
  },
  terminalLineError: { color: HUD.colors.phosphor },
  terminalLineWarn: { color: HUD.colors.phosphor }
});
