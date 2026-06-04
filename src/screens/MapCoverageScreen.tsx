import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import WebView from "react-native-webview";
import type { WebView as WebViewType } from "react-native-webview";
import { router, useNavigation } from "expo-router";
import { DrivePoint, distanceMeters, initialRfIntelligenceState, RfIntelligenceState, TowerEstimation, updateRfIntelligence } from "@/maps/rfIntelligence";
import { destinationPoint } from "@/maps/sector";
import { readActiveWifiSsid, readCells, readLocation, saveCurrentLog } from "@/services/telephonyService";
import { getLatestRuntimeState, setLatestCells } from "@/services/runtimeState";
import { buildConnectedTowerRadarSnapshot, ConnectedTowerRadarSnapshot } from "@/services/connectedTowerRadar";
import { HUD } from "@/theme/hud";
import { LocationPoint, NeighborTowerPayload, Settings, TelephonyCell, TowerType } from "@/types/telephony";
import { formatValue, getSignalColor, getSignalStatus } from "@/utils/signal";
import { SimCardPanel, WifiCard } from "@/components/SimCardPanel";
import { RfAzimuthRadar } from "@/components/RfAzimuthRadar";

type Props = {
  location: LocationPoint | null;
  cells: TelephonyCell[];
  settings: Settings;
};

type TowerPayload = Pick<TowerEstimation, "location" | "confidence" | "dotted" | "radiusMeters" | "azimuth" | "beamwidth">;

type MonopoleRangePayload = {
  location: LocationPoint;
  distanceMeters: number;
  radiusMeters: number;
  azimuthDegrees: number;
  label: string;
  operatorName: string;
  networkType: string;
  cellId: string | null;
  pci: string | null;
  address: string;
  locationText: string;
  lineStatus: string;
  source: string;
  isConnected: boolean;
};

type LeafletPayload = {
  center: LocationPoint;
  followMode: boolean;
  signalColor: string;
  route: { points: LocationPoint[]; color: string }[];
  user: LocationPoint;
  towers: {
    sim1: TowerPayload | null;
    sim2: TowerPayload | null;
  };
  towerColors: {
    sim1: string;
    sim2: string;
  };
  distancesToTower: {
    sim1: number | null;
    sim2: number | null;
  };
  operatorName: string;
  selectedSimSlot: number;
  neighbors: NeighborTowerPayload[];
  monopoleRanges: MonopoleRangePayload[];
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
const REALTIME_LOG_INTERVAL_MS = 1000;

const FALLBACK = { latitude: -6.2, longitude: 106.816666 };
const CONNECTED_TOWER_ICON_URI = Image.resolveAssetSource(require("@/img/watchtower.png")).uri;

export function MapCoverageScreen({ location, cells: initialCells, settings }: Props) {
  const navigation = useNavigation();
  const [isMonitoringActive, setIsMonitoringActive] = useState(() => getLatestRuntimeState().isMonitoringActive);
  const webViewRef = useRef<WebViewType | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [cells, setCells] = useState<TelephonyCell[]>(initialCells);
  const [currentLocation, setCurrentLocation] = useState<LocationPoint | null>(location);
  const [wifiSsid, setWifiSsid] = useState<string | null>(null);
  const [selectedSimSlot, setSelectedSimSlot] = useState<number>(() => {
    const registered = initialCells.find((c) => c.isRegistered);
    return registered ? registered.simSlot : 0;
  });
  
  const [rfState, setRfState] = useState<RfIntelligenceState>(() =>
    updateRfIntelligence(initialRfIntelligenceState(), initialCells, location, settings.defaultRadius, settings.defaultBeamwidth)
  );
  const [followMode, setFollowMode] = useState(true);
  const [driveMode, setDriveMode] = useState(settings.loggingEnabled);
  const [error, setError] = useState<string | null>(null);
  const [terminalLogs, setTerminalLogs] = useState<TerminalLogLine[]>(() => [
    {
      id: `boot-${Date.now()}`,
      level: "I",
      tag: "RfMonitor",
      message: "app-side realtime RF monitor attached; source=TelephonyModule polling",
      timestamp: Date.now()
    }
  ]);
  const terminalScrollRef = useRef<ScrollView | null>(null);
  const terminalSequence = useRef(1);
  const refreshInFlight = useRef(false);
  const leafletHtml = useMemo(() => buildLeafletHtml(CONNECTED_TOWER_ICON_URI), []);

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

  // Group cells by simSlot
  const sim1Cells = useMemo(() => cells.filter((c) => c.simSlot === 0), [cells]);
  const sim2Cells = useMemo(() => cells.filter((c) => c.simSlot === 1), [cells]);
  const sim1Primary = sim1Cells.find((c) => c.isRegistered) ?? sim1Cells[0] ?? null;
  const sim2Primary = sim2Cells.find((c) => c.isRegistered) ?? sim2Cells[0] ?? null;

  // Active cell is selected based on selectedSimSlot
  const activeCell = useMemo(() => {
    const targetCell = cells.find((c) => c.simSlot === selectedSimSlot && c.isRegistered) ?? 
                       cells.find((c) => c.simSlot === selectedSimSlot) ?? 
                       cells.find((c) => c.isRegistered) ?? 
                       cells[0] ?? null;
    return targetCell;
  }, [cells, selectedSimSlot]);

  const status = getSignalStatus(activeCell);
  const color = getSignalColor(status);
  const origin = currentLocation ?? FALLBACK;
  const towerSim1 = rfState.towerSim1;
  const towerSim2 = rfState.towerSim2;
  const activeTower = selectedSimSlot === 1 ? towerSim2 : towerSim1;
  const routeSegments = useMemo(() => buildRouteSegments(rfState.route), [rfState.route]);
  const radarSnapshot = useMemo(
    () => buildConnectedTowerRadarSnapshot(cells, currentLocation, selectedSimSlot),
    [cells, currentLocation, selectedSimSlot]
  );
  const monopoleRanges = useMemo(() => buildMonopoleRangePayloads(radarSnapshot), [radarSnapshot]);

  const distanceToTowerSim1 = useMemo(() => {
    if (!towerSim1 || !currentLocation) return null;
    return Math.round(distanceMeters(currentLocation, towerSim1.location));
  }, [currentLocation, towerSim1]);

  const distanceToTowerSim2 = useMemo(() => {
    if (!towerSim2 || !currentLocation) return null;
    return Math.round(distanceMeters(currentLocation, towerSim2.location));
  }, [currentLocation, towerSim2]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      setIsMonitoringActive(getLatestRuntimeState().isMonitoringActive);
    });
    return unsubscribe;
  }, [navigation]);

  const refresh = useCallback(async () => {
    const active = getLatestRuntimeState().isMonitoringActive;
    setIsMonitoringActive(active);
    if (!active) return;
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;

    try {
      setError(null);
      const [nextCells, nextLocation, nextWifi] = await Promise.all([
        readCells(),
        readLocation(),
        readActiveWifiSsid()
      ]);
      setCells(nextCells);
      setCurrentLocation(nextLocation);
      setWifiSsid(nextWifi);
      setLatestCells(nextCells, nextLocation);
      
      const currentSettings = getLatestRuntimeState().settings;
      setRfState((previous) => updateRfIntelligence(previous, nextCells, nextLocation, currentSettings.defaultRadius, currentSettings.defaultBeamwidth));
      
      const registered = nextCells.find((nextCell) => nextCell.simSlot === selectedSimSlot && nextCell.isRegistered) ?? 
                         nextCells.find((nextCell) => nextCell.simSlot === selectedSimSlot) ?? 
                         nextCells.find((nextCell) => nextCell.isRegistered) ?? 
                         nextCells[0];
                         
      if (registered && (driveMode || currentSettings.loggingEnabled)) {
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
          formatCellLogMessage(registered, nextCells.length, driveMode || currentSettings.loggingEnabled, nextLocation)
        );
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Gagal memperbarui RF map.";
      setError(message);
      appendTerminalLog("E", "TelephonyModule", message);
    } finally {
      refreshInFlight.current = false;
    }
  }, [appendTerminalLog, driveMode, selectedSimSlot]);

  useEffect(() => {
    if (!isMonitoringActive) return;
    void refresh();
  }, [refresh, isMonitoringActive]);

  useEffect(() => {
    if (!isMonitoringActive) return;
    const timer = setInterval(() => void refresh(), REALTIME_LOG_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh, isMonitoringActive]);

  const handleSelectSimSlot = useCallback((slot: number) => {
    setSelectedSimSlot(slot);
  }, []);

  const neighborTowers = useMemo(() => {
    if (!currentLocation) return [];
    return estimateNeighborTowers(cells, currentLocation);
  }, [cells, currentLocation]);

  const payload = useMemo<LeafletPayload>(
    () => ({
      center: origin,
      followMode,
      signalColor: color,
      route: routeSegments,
      user: origin,
      towers: {
        sim1: towerSim1
          ? {
              location: towerSim1.location,
              confidence: towerSim1.confidence,
              dotted: towerSim1.dotted,
              radiusMeters: towerSim1.radiusMeters,
              azimuth: towerSim1.azimuth,
              beamwidth: towerSim1.beamwidth
            }
          : null,
        sim2: towerSim2
          ? {
              location: towerSim2.location,
              confidence: towerSim2.confidence,
              dotted: towerSim2.dotted,
              radiusMeters: towerSim2.radiusMeters,
              azimuth: towerSim2.azimuth,
              beamwidth: towerSim2.beamwidth
            }
          : null
      },
      towerColors: {
        sim1: getSignalColor(getSignalStatus(sim1Primary)),
        sim2: getSignalColor(getSignalStatus(sim2Primary))
      },
      distancesToTower: {
        sim1: distanceToTowerSim1,
        sim2: distanceToTowerSim2
      },
      operatorName: activeCell?.operatorName || (wifiSsid ? `WiFi: ${wifiSsid}` : "WiFi Network"),
      selectedSimSlot,
      neighbors: neighborTowers,
      monopoleRanges
    }),
    [activeCell, color, distanceToTowerSim1, distanceToTowerSim2, followMode, monopoleRanges, neighborTowers, origin, routeSegments, sim1Primary, sim2Primary, towerSim1, towerSim2, wifiSsid, selectedSimSlot]
  );

  const sendPayload = useCallback(
    (nextPayload: LeafletPayload, forceFollow = false) => {
      const serialized = JSON.stringify({ ...nextPayload, followMode: forceFollow || nextPayload.followMode });
      webViewRef.current?.injectJavaScript(`window.updateRfMap(${serialized}); true;`);
    },
    []
  );

  useEffect(() => {
    if (!mapReady) return;
    sendPayload(payload);
  }, [mapReady, payload, sendPayload]);

  const recenter = useCallback(() => {
    sendPayload(payload, true);
  }, [payload, sendPayload]);

  // Determine active operator display
  const activeOperatorTitle = wifiSsid
    ? `WiFi: ${wifiSsid}`
    : activeCell
      ? `${activeCell.operatorName} (${activeCell.networkType})`
      : "Connected via WiFi";

  if (!isMonitoringActive) {
    return (
      <View style={styles.warningContainer}>
        <View style={styles.warningCard}>
          <Ionicons name="alert-circle" size={48} color={HUD.colors.amber} style={styles.warningIcon} />
          <Text style={styles.warningTitle}>MONITORING INACTIVE</Text>
          <Text style={styles.warningDescription}>
            Aplikasi tidak dapat menampilkan radar sonar seluler karena mesin monitoring sedang dinonaktifkan di halaman Dashboard. Harap aktifkan kembali di Dashboard.
          </Text>
          <Pressable style={styles.warningButton} onPress={() => router.navigate("/")}>
            <Ionicons name="speedometer" size={16} color={HUD.colors.bg} />
            <Text style={styles.warningButtonText}>Buka Dashboard</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* ====== MAP AREA ====== */}
      <View style={styles.mapContainer}>
        <WebView
          ref={webViewRef}
          originWhitelist={["*"]}
          source={{ html: leafletHtml }}
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess
          allowUniversalAccessFromFileURLs
          setSupportMultipleWindows={false}
          onMessage={(event) => {
            if (event.nativeEvent.data === "leaflet-ready") {
              setMapReady(true);
            }
          }}
          style={styles.map}
        />

        {/* Floating Operator Badge */}
        <View style={styles.operatorFloatingBadge}>
          <Ionicons name={wifiSsid ? "wifi" : "cellular"} size={14} color={HUD.colors.cyan} />
          <Text style={styles.operatorFloatingText} numberOfLines={1}>{activeOperatorTitle}</Text>
        </View>

        {/* Transparent Live Logcat Overlay */}
        <ScrollView
          ref={terminalScrollRef}
          style={styles.terminalOverlay}
          contentContainerStyle={styles.terminalOverlayContent}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => terminalScrollRef.current?.scrollToEnd({ animated: true })}
        >
          {terminalLogs.map((line) => (
            <Text
              key={line.id}
              style={[
                styles.terminalLine,
                line.level === "E" && styles.terminalLineError,
                line.level === "W" && styles.terminalLineWarn,
              ]}
            >
              {formatLogcatLine(line)}
            </Text>
          ))}
        </ScrollView>
        {/* Floating action buttons */}
        <View style={styles.fabContainer}>
          <Pressable
            onPress={() => setFollowMode((v) => !v)}
            style={[styles.fab, followMode && styles.fabActive]}
          >
            <Ionicons name={followMode ? "navigate" : "navigate-outline"} color={followMode ? HUD.colors.bg : HUD.colors.text} size={18} />
          </Pressable>
          <Pressable onPress={recenter} style={styles.fab}>
            <Ionicons name="locate" color={HUD.colors.text} size={18} />
          </Pressable>
          <Pressable
            onPress={() => setDriveMode((v) => !v)}
            style={[styles.fab, driveMode && styles.fabDrive]}
          >
            <Ionicons name={driveMode ? "stop-circle" : "radio-button-on"} color={driveMode ? HUD.colors.amberStrong : HUD.colors.text} size={18} />
          </Pressable>
        </View>
      </View>

      {/* ====== BOTTOM PANEL ====== */}
      <View style={styles.bottomPanel}>
        {/* GPS Info Bar */}
        <View style={styles.gpsBar}>
          <GpsItem label="GPS Location" value={formatGps(currentLocation)} />
          <View style={styles.gpsDivider} />
          <GpsItem label="Speed" value={formatSpeed(currentLocation?.speed)} />
          <View style={styles.gpsDivider} />
          <GpsItem label="Altitude" value={formatAltitude(currentLocation?.altitude)} />
        </View>

        {/* Tab Content */}
        <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentInner} showsVerticalScrollIndicator={false}>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <DashboardTab
            sim1={sim1Primary}
            sim2={sim2Primary}
            activeCell={activeCell}
            color={color}
            hasCells={cells.length > 0}
            wifiSsid={wifiSsid}
            selectedSimSlot={selectedSimSlot}
            onSelectSim={handleSelectSimSlot}
          />

          <View style={styles.sectionDivider} />
          <RfAzimuthRadar snapshot={radarSnapshot} />

          {cells.length > 0 ? (
            <>
              <View style={styles.sectionDivider} />
              <ConnectedTowerTab
                cell={activeCell}
                tower={activeTower}
                towerDistanceM={selectedSimSlot === 1 ? distanceToTowerSim2 : distanceToTowerSim1}
                rfState={rfState}
                color={color}
              />
            </>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

/* =========================================================================
   SUB-COMPONENTS
   ========================================================================= */

function GpsItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.gpsItem}>
      <Text style={styles.gpsLabel}>{label}</Text>
      <Text style={styles.gpsValue}>{value}</Text>
    </View>
  );
}

function DashboardTab({
  sim1,
  sim2,
  activeCell,
  color,
  hasCells,
  wifiSsid,
  selectedSimSlot,
  onSelectSim,
}: {
  sim1: TelephonyCell | null;
  sim2: TelephonyCell | null;
  activeCell: TelephonyCell | null;
  color: string;
  hasCells: boolean;
  wifiSsid: string | null;
  selectedSimSlot: number;
  onSelectSim: (slot: number) => void;
}) {
  if (!hasCells) {
    return (
      <View style={styles.simRow}>
        <WifiCard ssid={wifiSsid} />
      </View>
    );
  }

  return (
    <View style={styles.dashboardStack}>
      {wifiSsid ? (
        <View style={styles.wifiStatusStrip}>
          <Ionicons name="wifi" size={14} color={HUD.colors.cyan} />
          <Text style={styles.wifiStatusText} numberOfLines={1}>WiFi: {wifiSsid}</Text>
        </View>
      ) : null}
      <View style={styles.simRow}>
        <SimCardPanel
          cell={sim1}
          simSlot={0}
          isActive={selectedSimSlot === 0}
          accentColor={color}
          onPress={() => onSelectSim(0)}
        />
        <SimCardPanel
          cell={sim2}
          simSlot={1}
          isActive={selectedSimSlot === 1}
          accentColor={color}
          onPress={() => onSelectSim(1)}
        />
      </View>
    </View>
  );
}

function ConnectedTowerTab({
  cell,
  tower,
  towerDistanceM,
  rfState,
  color,
}: {
  cell: TelephonyCell | null;
  tower: TowerEstimation | null;
  towerDistanceM: number | null;
  rfState: RfIntelligenceState;
  color: string;
}) {
  return (
    <View style={styles.towerTab}>
      {/* Tower Distance Card */}
      <View style={[styles.distanceCard, { borderLeftColor: color }]}>
        <Ionicons name="cellular" size={28} color={color} />
        <View style={styles.distanceInfo}>
          <Text style={styles.distanceLabel}>Distance to Connected Tower</Text>
          <Text style={[styles.distanceValue, { color }]}>
            {towerDistanceM !== null ? `${towerDistanceM} m` : "N/A"}
          </Text>
        </View>
        <View style={styles.confidenceBadge}>
          <Text style={styles.confidenceText}>{tower?.confidence ?? 0}%</Text>
          <Text style={styles.confidenceLabel}>confidence</Text>
        </View>
      </View>

      {/* RF Metrics */}
      <View style={styles.towerMetrics}>
        <TowerMetric label="Operator" value={formatValue(cell?.operatorName)} />
        <TowerMetric label="Network" value={formatValue(cell?.networkType)} />
        <TowerMetric label="Cell ID" value={formatValue(cell?.cellId)} />
        <TowerMetric label="PCI" value={formatValue(cell?.pci)} />
        <TowerMetric label="TAC/LAC" value={formatValue(cell?.tac ?? cell?.lac)} />
        <TowerMetric label="Band" value={formatValue(cell?.band)} />
        <TowerMetric label="EARFCN" value={formatValue(cell?.earfcn ?? cell?.nrarfcn)} />
        <TowerMetric label="RSRP" value={formatValue(cell?.rsrp, " dBm")} accent={color} />
        <TowerMetric label="RSRQ" value={formatValue(cell?.rsrq, " dB")} />
        <TowerMetric label="RSSI" value={formatValue(cell?.rssi, " dBm")} />
        <TowerMetric label="SINR" value={formatValue(cell?.sinr, " dB")} />
        <TowerMetric label="TA" value={formatValue(cell?.timingAdvance ?? "-")} />
      </View>

      {/* Intelligence */}
      <View style={styles.intelSection}>
        <Text style={styles.intelSectionTitle}>RF INTELLIGENCE</Text>
        <View style={styles.intelRow}>
          <IntelBadge label="Signal" value={rfState.signalTrend} active={rfState.signalTrend === "improving"} />
          <IntelBadge label="Movement" value={rfState.movementTrend} active={rfState.movementTrend === "closer"} />
        </View>
        <View style={styles.eventRow}>
          <EventFlag label="Handover" active={rfState.handover} />
          <EventFlag label="PCI Δ" active={rfState.pciChanged} />
          <EventFlag label="TAC Δ" active={rfState.areaChanged} />
          <EventFlag label="Radio Δ" active={rfState.radioChanged} />
        </View>
      </View>
    </View>
  );
}

function TowerMetric({ label, value, accent = HUD.colors.text }: { label: string; value: string; accent?: string }) {
  return (
    <View style={styles.towerMetric}>
      <Text style={styles.towerMetricLabel}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.towerMetricValue, { color: accent }]}>{value}</Text>
    </View>
  );
}

function IntelBadge({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <View style={[styles.intelBadge, active && styles.intelBadgeActive]}>
      <Text style={styles.intelBadgeLabel}>{label}</Text>
      <Text style={styles.intelBadgeValue}>{value.toUpperCase()}</Text>
    </View>
  );
}

function EventFlag({ label, active }: { label: string; active: boolean }) {
  return <Text style={[styles.eventFlag, active && styles.eventFlagActive]}>{label}</Text>;
}

function buildMonopoleRangePayloads(snapshot: ConnectedTowerRadarSnapshot): MonopoleRangePayload[] {
  const ranges: MonopoleRangePayload[] = [];

  [snapshot.connected, ...snapshot.neighbors].forEach((match) => {
    if (!match || match.locationStatus !== "known") return;
    const tower = match.tower;
    if (!tower || tower.towerType !== "monopole" || tower.radio !== "LTE") return;
    if (typeof match.distanceMeters !== "number" || typeof match.azimuthDegrees !== "number") return;
    const locationText = formatTowerLocation(tower.address, tower.latitude, tower.longitude);

    ranges.push({
      location: {
        latitude: tower.latitude,
        longitude: tower.longitude
      },
      distanceMeters: match.distanceMeters,
      radiusMeters: Math.max(20, match.distanceMeters),
      azimuthDegrees: match.azimuthDegrees,
      label: tower.label ?? "Monopole tower",
      operatorName: match.cell.operatorName || "Unknown",
      networkType: match.cell.networkType,
      cellId: match.cell.cellId,
      pci: match.cell.pci,
      address: tower.address ?? locationText,
      locationText,
      lineStatus: match.isConnected ? "USER CONNECTED TO LTE MONOPOLE" : "LTE MONOPOLE OBSERVED",
      source: tower.source,
      isConnected: match.isConnected
    });
  });

  return ranges;
}

function formatTowerLocation(address: string | undefined, latitude: number, longitude: number): string {
  if (address && address.trim().length > 0) return address;
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

/* =========================================================================
   HELPERS
   ========================================================================= */

function buildRouteSegments(points: DrivePoint[]) {
  return [];
}

/* ─── Tower Classification & Estimation ──────────────────────────────────── */

function classifyTowerType(cell: TelephonyCell): TowerType {
  const nt = cell.networkType;
  if (nt === "NR" || nt === "5G SA" || nt === "5G NSA") return "5G_POLE";
  if (nt === "LTE") {
    // Small cells typically have very strong signals (close range, indoor)
    if (typeof cell.rsrp === "number" && cell.rsrp >= -75 && !cell.isRegistered) return "SMALL_CELL";
    return "LTE_MONOPOLE";
  }
  // GSM / WCDMA legacy towers
  return "LTE_MONOPOLE";
}

/**
 * Deterministic bearing from PCI value.
 * Ensures same PCI always appears at the same angular position on the radar.
 */
function bearingFromPci(pci: string | null, index: number): number {
  if (pci) {
    const pciNum = parseInt(pci, 10);
    if (!isNaN(pciNum)) return (pciNum * 37 + pciNum * 13) % 360;
  }
  // Fallback: distribute evenly using index
  return (index * 47 + 15) % 360;
}

/**
 * Estimate distance to tower based on RSRP heuristic.
 * Stronger signal = closer tower.
 */
function distanceFromRsrp(rsrp: number | null): number {
  if (typeof rsrp !== "number") return 1200;
  if (rsrp >= -65) return 80;    // Femtocell / indoor repeater
  if (rsrp >= -75) return 150;   // Small cell / pole
  if (rsrp >= -85) return 350;   // Close macro tower
  if (rsrp >= -95) return 700;   // Medium distance
  if (rsrp >= -105) return 1200; // Far
  if (rsrp >= -115) return 2000; // Very far
  return 3000;                    // Edge of coverage
}

/**
 * Build NeighborTowerPayload array from all detected cells.
 * Includes both serving and neighbor cells — each gets an estimated GPS location.
 */
function estimateNeighborTowers(
  cells: TelephonyCell[],
  userLocation: LocationPoint
): NeighborTowerPayload[] {
  // Deduplicate by PCI to avoid overlapping icons for the same physical tower
  const seen = new Set<string>();
  const result: NeighborTowerPayload[] = [];

  cells.forEach((cell, index) => {
    const key = `${cell.simSlot}-${cell.pci ?? cell.cellId ?? index}`;
    if (seen.has(key)) return;
    seen.add(key);

    const bearing = bearingFromPci(cell.pci, index);
    const dist = distanceFromRsrp(cell.rsrp);
    const estimatedLocation = destinationPoint(userLocation, bearing, dist);
    const towerType = classifyTowerType(cell);

    result.push({
      location: estimatedLocation,
      bearing,
      distanceMeters: dist,
      towerType,
      isServing: cell.isRegistered,
      networkType: cell.networkType,
      operatorName: cell.operatorName,
      pci: cell.pci,
      cellId: cell.cellId,
      band: cell.band,
      rsrp: cell.rsrp,
      rsrq: cell.rsrq,
      sinr: cell.sinr,
      simSlot: cell.simSlot
    });
  });

  return result;
}

function formatSpeed(speed?: number | null): string {
  if (typeof speed !== "number" || speed < 0) return "0 km/h";
  return `${Math.round(speed * 3.6)} km/h`;
}

function formatAltitude(altitude?: number | null): string {
  if (typeof altitude !== "number") return "0 m";
  return `${Math.round(altitude)} m`;
}

function formatGps(location: LocationPoint | null): string {
  if (!location) return "N/A";
  return `${location.latitude.toFixed(5)},\n${location.longitude.toFixed(5)}`;
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

/* =========================================================================
   LEAFLET HTML WITH SONAR ANIMATION & SVG BTS MARKERS
   ========================================================================= */

function buildLeafletHtml(connectedTowerIconUri: string): string {
  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
  <style>
    html, body, #map { height: 100%; margin: 0; background: #03070A; }
    .leaflet-container { background: #03070A; font-family: ui-monospace, "Courier New", monospace; }
    .leaflet-tile-pane { filter: grayscale(0.82) invert(1) hue-rotate(176deg) brightness(0.72) contrast(1.28) saturate(0.48); }
    .leaflet-control-attribution { display: none; }

    /* User icon */
    .user-icon {
      align-items: center;
      border-radius: 999px;
      display: flex;
      justify-content: center;
      transform: translate(-50%, -50%);
      background: rgba(255, 255, 255, 0.14);
      border: 2px solid rgba(240, 244, 248, 0.9);
      box-shadow: 0 0 18px rgba(255, 255, 255, 0.28);
      height: 28px;
      width: 28px;
    }
    .user-icon::after {
      background: #FFFFFF;
      border-radius: 999px;
      content: "";
      height: 12px;
      width: 12px;
    }

    /* User marker container */
    .user-marker-container {
      position: relative;
      width: 28px;
      height: 28px;
    }
    
    /* Transparent Floating Signal Status Bubble above User */
    .user-signal-bubble {
      position: absolute;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(3, 7, 10, 0.88);
      border: 1px solid var(--bubble-color, #FFFFFF);
      border-radius: 6px;
      padding: 3px 6px;
      white-space: nowrap;
      pointer-events: none;
      box-shadow: 0 0 10px var(--bubble-glow, rgba(255, 255, 255, 0.26));
      display: flex;
      align-items: center;
      gap: 4px;
      z-index: 9999 !important;
    }
    .user-signal-text {
      color: #F0F4F8;
      font-size: 8px;
      font-weight: 900;
      font-family: ui-monospace, "Courier New", monospace;
      letter-spacing: 0.5px;
    }
    .user-signal-icon {
      font-size: 10px;
    }

    /* Connected BTS marker */
    .bts-marker-container {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 50px;
      height: 50px;
      transform: translate(-50%, -50%);
      z-index: 1000 !important;
    }
    .bts-icon-premium {
      background: rgba(3, 7, 10, 0.18);
      border: 2px solid var(--bts-border-color, #FFFFFF);
      border-radius: 999px;
      box-shadow: 0 0 18px var(--bts-glow-color, rgba(255, 255, 255, 0.28));
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      overflow: hidden;
      padding: 0;
      transition: all 0.3s ease;
    }
    .bts-icon-image {
      display: block;
      height: 100%;
      object-fit: cover;
      width: 100%;
    }

    /* Static Concentric Range Rings (Professional Telecom Style) */
    .sonar-container {
      position: relative;
      width: 320px;
      height: 320px;
      transform: translate(-50%, -50%);
      pointer-events: none;
    }
    .sonar-ring {
      position: absolute;
      border: 1px dashed var(--sonar-color, rgba(255, 255, 255, 0.38));
      border-radius: 50%;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      pointer-events: none;
    }
    .sonar-ring:nth-child(1) { width: 100px; height: 100px; }
    .sonar-ring:nth-child(2) { width: 200px; height: 200px; }
    .sonar-ring:nth-child(3) { width: 300px; height: 300px; }
    .sonar-ring.ring-fill {
      display: none;
    }

    .sweet-spot-marker {
      align-items: center;
      background: rgba(57, 255, 20, 0.16);
      border: 1px solid #39FF14;
      border-radius: 999px;
      box-shadow: 0 0 18px rgba(57, 255, 20, 0.72);
      color: #39FF14;
      display: flex;
      font-size: 22px;
      height: 34px;
      justify-content: center;
      transform: translate(-50%, -50%);
      width: 34px;
    }
    .sweet-popup .leaflet-popup-content-wrapper {
      background: rgba(0, 0, 0, 0.92);
      border: 1px solid #39FF14;
      border-radius: 6px;
      box-shadow: 0 0 18px rgba(57, 255, 20, 0.38);
      color: #39FF14;
      font-family: ui-monospace, "Courier New", monospace;
      font-size: 11px;
      font-weight: 900;
    }
    .sweet-popup .leaflet-popup-tip {
      background: #39FF14;
    }

    /* Distance label */
    .distance-label {
      background: rgba(3, 7, 10, 0.9);
      border: 1px solid #FFFFFF;
      border-radius: 6px;
      color: #FFFFFF;
      font-family: ui-monospace, "Courier New", monospace;
      font-size: 11px;
      font-weight: 900;
      padding: 4px 8px;
      white-space: nowrap;
      transform: translate(-50%, -50%);
      pointer-events: none;
      box-shadow: 0 0 12px rgba(255, 255, 255, 0.26);
    }

    .monopole-radius-label {
      background: rgba(3, 7, 10, 0.92);
      border: 1px solid #D7D7D7;
      border-radius: 6px;
      box-shadow: 0 0 12px rgba(255, 255, 255, 0.24);
      color: #F5F5F5;
      font-family: ui-monospace, "Courier New", monospace;
      font-size: 9px;
      font-weight: 900;
      padding: 4px 7px;
      pointer-events: none;
      transform: translate(-50%, -50%);
      white-space: nowrap;
    }
    .monopole-radius-label.is-connected {
      border-color: #39FF14;
      color: #39FF14;
    }
    .monopole-line-status {
      background: rgba(3, 7, 10, 0.94);
      border: 1px solid #39FF14;
      border-radius: 6px;
      box-shadow: 0 0 14px rgba(57, 255, 20, 0.26);
      color: #39FF14;
      font-family: ui-monospace, "Courier New", monospace;
      font-size: 9px;
      font-weight: 900;
      line-height: 1.35;
      max-width: 220px;
      padding: 5px 7px;
      pointer-events: none;
      transform: translate(-50%, -50%);
      white-space: normal;
    }
    .monopole-line-status .muted,
    .monopole-location-label .muted {
      color: #D7D7D7;
      display: block;
      font-size: 8px;
      margin-top: 2px;
    }
    .monopole-location-label {
      background: rgba(3, 7, 10, 0.94);
      border: 1px solid #D7D7D7;
      border-radius: 6px;
      box-shadow: 0 0 12px rgba(255, 255, 255, 0.2);
      color: #F5F5F5;
      font-family: ui-monospace, "Courier New", monospace;
      font-size: 8px;
      font-weight: 900;
      line-height: 1.35;
      max-width: 230px;
      padding: 5px 7px;
      pointer-events: none;
      transform: translate(-50%, -115%);
      white-space: normal;
    }

    /* ── Neighbor / Small Cell Tower Markers ────────────────────── */
    .neighbor-tower-container {
      display: flex;
      align-items: center;
      justify-content: center;
      transform: translate(-50%, -50%);
      z-index: 800 !important;
    }
    .neighbor-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(4, 9, 13, 0.92);
      border-radius: 5px;
      padding: 3px;
      transition: all 0.3s ease;
    }
    .neighbor-icon.type-5g {
      border: 1.5px solid #00F0FF;
      box-shadow: 0 0 10px rgba(0, 240, 255, 0.35);
      width: 30px; height: 30px;
    }
    .neighbor-icon.type-lte {
      border: 1.5px solid #FFB000;
      border-radius: 999px;
      box-shadow: 0 0 10px rgba(255, 176, 0, 0.3);
      overflow: hidden;
      padding: 0;
      width: 34px; height: 34px;
    }
    .neighbor-tower-image {
      display: block;
      height: 100%;
      object-fit: cover;
      width: 100%;
    }
    .neighbor-icon.type-small {
      border: 1.5px solid #39FF14;
      box-shadow: 0 0 8px rgba(57, 255, 20, 0.3);
      width: 22px; height: 22px;
    }
    .neighbor-icon.type-mw {
      border: 1.5px solid #E040FB;
      box-shadow: 0 0 12px rgba(224, 64, 251, 0.35);
      width: 28px; height: 28px;
    }
    .neighbor-icon.is-serving {
      border-width: 2.5px;
      filter: brightness(1.3);
    }
    .neighbor-label {
      position: absolute;
      bottom: -14px;
      left: 50%;
      transform: translateX(-50%);
      font-family: ui-monospace, "Courier New", monospace;
      font-size: 7px;
      font-weight: 900;
      white-space: nowrap;
      pointer-events: none;
      text-shadow: 0 0 4px rgba(0,0,0,0.9);
    }
    .neighbor-label.type-5g { color: #00F0FF; }
    .neighbor-label.type-lte { color: #FFB000; }
    .neighbor-label.type-small { color: #39FF14; }
    .neighbor-label.type-mw { color: #E040FB; }

    /* Popup styling for neighbor towers */
    .neighbor-popup .leaflet-popup-content-wrapper {
      background: rgba(3, 7, 10, 0.94);
      border: 1px solid #3A3F47;
      border-radius: 6px;
      box-shadow: 0 0 18px rgba(0, 240, 255, 0.22);
      color: #F0F4F8;
      font-family: ui-monospace, "Courier New", monospace;
      font-size: 10px;
      font-weight: 700;
      padding: 0;
    }
    .neighbor-popup .leaflet-popup-tip {
      background: #3A3F47;
    }
    .neighbor-popup .leaflet-popup-content {
      margin: 8px 10px;
      line-height: 1.5;
    }
    .popup-title {
      font-size: 11px;
      font-weight: 900;
      margin-bottom: 4px;
      letter-spacing: 0.5px;
    }
    .popup-title.type-5g { color: #00F0FF; }
    .popup-title.type-lte { color: #FFB000; }
    .popup-title.type-small { color: #39FF14; }
    .popup-title.type-mw { color: #E040FB; }
    .popup-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
    .popup-label { color: #8B929A; }
    .popup-value { color: #F0F4F8; font-weight: 900; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const CONNECTED_TOWER_ICON_URI = ${JSON.stringify(connectedTowerIconUri)};
    const map = L.map("map", {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true
    }).setView([-6.2, 106.816666], 15);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      crossOrigin: true
    }).addTo(map);

    let userMarker = null;
    const towerMarkers = { sim1: null, sim2: null };
    const sonarMarkers = { sim1: null, sim2: null };
    const sectorLayerGroup = L.layerGroup().addTo(map);
    const radiusLayerGroup = L.layerGroup().addTo(map);
    const beamLayerGroup = L.layerGroup().addTo(map);
    const distanceLayerGroup = L.layerGroup().addTo(map);
    const sweetSpotLayerGroup = L.layerGroup().addTo(map);
    const neighborLayerGroup = L.layerGroup().addTo(map);
    const monopoleRangeLayerGroup = L.layerGroup().addTo(map);
    let routeLayerGroup = L.layerGroup().addTo(map);

    // ── SVG Icon Generators for different tower types ──
    const TOWER_5G_SVG = (color) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      + '<line x1="12" y1="3" x2="12" y2="21"></line>'
      + '<path d="M15.5 6c1.2 1.2 1.2 3 0 4.2"></path>'
      + '<path d="M17.5 4c2.2 2.2 2.2 5.6 0 7.8"></path>'
      + '<path d="M8.5 6c-1.2 1.2-1.2 3 0 4.2"></path>'
      + '<path d="M6.5 4c-2.2 2.2-2.2 5.6 0 7.8"></path>'
      + '<circle cx="12" cy="7" r="1" fill="' + color + '"></circle>'
      + '<text x="12" y="20" text-anchor="middle" fill="' + color + '" font-size="5" font-weight="900" font-family="monospace">5G</text>'
      + '</svg>';

    const TOWER_LTE_SVG = () => '<img class="neighbor-tower-image" src="' + CONNECTED_TOWER_ICON_URI + '" alt="LTE tower" />';

    const TOWER_SMALL_SVG = (color) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      + '<circle cx="12" cy="8" r="3"></circle>'
      + '<circle cx="12" cy="8" r="1" fill="' + color + '"></circle>'
      + '<line x1="12" y1="11" x2="12" y2="20"></line>'
      + '<line x1="9" y1="20" x2="15" y2="20"></line>'
      + '</svg>';

    const TOWER_MW_SVG = (color) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
      + '<rect x="8" y="4" width="8" height="5" rx="1" fill="none"></rect>'
      + '<circle cx="12" cy="6.5" r="1" fill="' + color + '"></circle>'
      + '<line x1="12" y1="9" x2="12" y2="22"></line>'
      + '<path d="M9 22l3-4 3 4"></path>'
      + '<path d="M5 6.5 L8 6.5" stroke-dasharray="2 2"></path>'
      + '<path d="M16 6.5 L19 6.5" stroke-dasharray="2 2"></path>'
      + '</svg>';

    function latLng(point) {
      return [point.latitude, point.longitude];
    }

    function midPoint(a, b) {
      return [(a.latitude + b.latitude) / 2, (a.longitude + b.longitude) / 2];
    }

    function toRad(value) {
      return value * Math.PI / 180;
    }

    function toDeg(value) {
      return value * 180 / Math.PI;
    }

    function destination(origin, bearingDegrees, distanceMeters) {
      const earthRadius = 6371000;
      const angularDistance = distanceMeters / earthRadius;
      const bearing = toRad(bearingDegrees);
      const lat1 = toRad(origin.latitude);
      const lon1 = toRad(origin.longitude);
      const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angularDistance) + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing));
      const lon2 = lon1 + Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
        Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
      );
      return { latitude: toDeg(lat2), longitude: toDeg(lon2) };
    }

    function bearingBetween(from, to) {
      const lat1 = toRad(from.latitude);
      const lat2 = toRad(to.latitude);
      const deltaLon = toRad(to.longitude - from.longitude);
      const y = Math.sin(deltaLon) * Math.cos(lat2);
      const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
      return (toDeg(Math.atan2(y, x)) + 360) % 360;
    }

    function sectorPolygon(tower, user) {
      const beamBearing = bearingBetween(tower.location, user);
      const half = tower.beamwidth / 2;
      const left = destination(tower.location, beamBearing - half, tower.radiusMeters);
      const right = destination(tower.location, beamBearing + half, tower.radiusMeters);
      return [tower.location, left, right, tower.location].map(latLng);
    }

    function updateMarker(existing, point, html, className) {
      const icon = L.divIcon({ html, className, iconSize: [1, 1] });
      if (existing) {
        existing.setLatLng(latLng(point));
        existing.setIcon(icon);
        return existing;
      }
      return L.marker(latLng(point), { icon, interactive: false }).addTo(map);
    }

    function removeMarker(marker) {
      if (marker) map.removeLayer(marker);
      return null;
    }

    function colorForTower(payload, key) {
      return (payload.towerColors && payload.towerColors[key]) || payload.signalColor || "#40E0C9";
    }

    function formatDistance(value) {
      if (value === null || value === undefined) return "N/A";
      return value >= 1000 ? (value / 1000).toFixed(1) + " km" : value + " m";
    }

    function escapeHtml(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    window.updateRfMap = function(payload) {
      // Dynamic User marker with distance/radius signal bars
      const activeKey = payload.selectedSimSlot === 1 ? "sim2" : "sim1";
      const activeTower = payload.towers ? payload.towers[activeKey] : null;
      const activeDistance = payload.distancesToTower ? payload.distancesToTower[activeKey] : null;

      let userHtml = '<div class="user-marker-container"><div class="user-icon"></div>';
      
      if (activeTower && activeDistance !== null) {
        const radius = activeTower.radiusMeters;
        const ratio = activeDistance / radius;
        let icon = "📵";
        let statusText = "OUT OF COVERAGE";
        let bubbleColor = "#B8B8B8";
        let glowColor = "rgba(255, 255, 255, 0.22)";
        
        if (ratio <= 0.25) {
          icon = "📶 [IIII]";
          statusText = "EXCELLENT";
          bubbleColor = "#FFFFFF";
          glowColor = "rgba(255, 255, 255, 0.28)";
        } else if (ratio <= 0.50) {
          icon = "📶 [III.]";
          statusText = "GOOD";
          bubbleColor = "#E6E6E6";
          glowColor = "rgba(255, 255, 255, 0.24)";
        } else if (ratio <= 0.75) {
          icon = "📶 [II..]";
          statusText = "FAIR";
          bubbleColor = "#CFCFCF";
          glowColor = "rgba(255, 255, 255, 0.22)";
        } else if (ratio <= 1.00) {
          icon = "📶 [I...]";
          statusText = "POOR";
          bubbleColor = "#B8B8B8";
          glowColor = "rgba(255, 255, 255, 0.2)";
        }
        
        userHtml += '<div class="user-signal-bubble" style="--bubble-color: ' + bubbleColor + '; --bubble-glow: ' + glowColor + ';">'
          + '<span class="user-signal-icon">' + icon + '</span>'
          + '<span class="user-signal-text">' + statusText + ' (' + Math.round(activeDistance) + 'm / ' + Math.round(radius) + 'm)</span>'
          + '</div>';
      } else {
        userHtml += '<div class="user-signal-bubble" style="--bubble-color: #A7A7A7; --bubble-glow: rgba(255, 255, 255, 0.18);">'
          + '<span class="user-signal-icon">📵</span>'
          + '<span class="user-signal-text">NO ACTIVE TOWER</span>'
          + '</div>';
      }
      userHtml += '</div>';

      userMarker = updateMarker(userMarker, payload.user, userHtml, "");

      sectorLayerGroup.clearLayers();
      radiusLayerGroup.clearLayers();
      beamLayerGroup.clearLayers();
      distanceLayerGroup.clearLayers();
      sweetSpotLayerGroup.clearLayers();
      monopoleRangeLayerGroup.clearLayers();

      ["sim1", "sim2"].forEach(function(key, index) {
        const tower = payload.towers ? payload.towers[key] : null;
        const label = key === "sim1" ? "SIM 1" : "SIM 2";
        
        const activeKey = payload.selectedSimSlot === 1 ? "sim2" : "sim1";
        if (key !== activeKey || !tower) {
          towerMarkers[key] = removeMarker(towerMarkers[key]);
          sonarMarkers[key] = removeMarker(sonarMarkers[key]);
          return;
        }

        const glowColor = colorForTower(payload, key);
        const towerHtml = '<div class="bts-marker-container" style="--bts-border-color: ' + glowColor + '; --bts-glow-color: ' + glowColor + '42;">'
          + '<div class="bts-icon-premium">'
          + '<img class="bts-icon-image" src="' + CONNECTED_TOWER_ICON_URI + '" alt="Connected tower" />'
          + '</div>'
          + '</div>';
        towerMarkers[key] = updateMarker(towerMarkers[key], tower.location, towerHtml, "");

        sonarMarkers[key] = removeMarker(sonarMarkers[key]);

        L.polygon(sectorPolygon(tower, payload.user), {
          color: "#FFFFFF",
          fillColor: "#FFFFFF",
          fillOpacity: 0.12,
          interactive: false,
          opacity: 0.75,
          weight: 2
        }).addTo(sectorLayerGroup);

        L.circle(latLng(tower.location), {
          color: "#D7D7D7",
          fillColor: "#D7D7D7",
          fillOpacity: 0.012,
          interactive: false,
          radius: tower.radiusMeters,
          weight: 2,
          dashArray: "8 8"
        }).addTo(radiusLayerGroup);

        L.polyline([latLng(tower.location), latLng(payload.user)], {
          color: "#FFFFFF",
          dashArray: "6 8",
          interactive: false,
          opacity: 0.85,
          weight: 2
        }).addTo(beamLayerGroup);

        const distanceValue = payload.distancesToTower ? payload.distancesToTower[key] : null;
        const distIcon = L.divIcon({
          html: '<div class="distance-label">' + label + ': ' + formatDistance(distanceValue) + '</div>',
          className: "",
          iconSize: [1, 1]
        });
        L.marker(midPoint(payload.user, tower.location), { icon: distIcon, interactive: false }).addTo(distanceLayerGroup);
      });

      // Local database monopole radius rings. Radius equals live user-to-tower distance.
      if (payload.monopoleRanges && payload.monopoleRanges.length > 0) {
        payload.monopoleRanges.forEach(function(range) {
          if (!range || !range.location || range.radiusMeters === null || range.radiusMeters === undefined) return;
          var rangeColor = range.isConnected ? '#39FF14' : 'rgba(255,255,255,0.42)';
          var lineStatusHtml = '<div class="monopole-line-status">'
            + escapeHtml(range.lineStatus || 'LTE MONOPOLE LINK')
            + '<span class="muted">radius/jarak ' + escapeHtml(formatDistance(range.distanceMeters)) + ' | azimuth ' + escapeHtml(String(range.azimuthDegrees)) + ' deg</span>'
            + '</div>';
          var locationHtml = '<div class="monopole-location-label">'
            + 'LOKASI LTE MONOPOLE'
            + '<span class="muted">' + escapeHtml(range.locationText || range.address || 'Unknown location') + '</span>'
            + '</div>';

          L.circle(latLng(range.location), {
            color: rangeColor,
            dashArray: range.isConnected ? '5 5' : '2 7',
            fillColor: rangeColor,
            fillOpacity: range.isConnected ? 0.035 : 0.012,
            interactive: false,
            opacity: range.isConnected ? 0.85 : 0.45,
            radius: Math.max(20, range.radiusMeters),
            weight: range.isConnected ? 2 : 1
          }).addTo(monopoleRangeLayerGroup);

          L.polyline([latLng(payload.user), latLng(range.location)], {
            color: rangeColor,
            dashArray: range.isConnected ? '8 5' : '3 7',
            interactive: false,
            opacity: range.isConnected ? 0.85 : 0.45,
            weight: range.isConnected ? 2 : 1
          }).addTo(monopoleRangeLayerGroup);

          var lineStatusIcon = L.divIcon({
            html: lineStatusHtml,
            className: '',
            iconSize: [1, 1]
          });
          L.marker(midPoint(payload.user, range.location), { icon: lineStatusIcon, interactive: false }).addTo(monopoleRangeLayerGroup);

          var locationIcon = L.divIcon({
            html: locationHtml,
            className: '',
            iconSize: [1, 1]
          });
          L.marker(latLng(range.location), { icon: locationIcon, interactive: false }).addTo(monopoleRangeLayerGroup);
        });
      }

      // ── Neighbor Towers (All Detected Cells) ──
      neighborLayerGroup.clearLayers();
      if (payload.neighbors && payload.neighbors.length > 0) {
        payload.neighbors.forEach(function(nb) {
          var cssType = 'type-lte';
          var svgFn = TOWER_LTE_SVG;
          var iconColor = '#FFB000';
          var towerLabel = 'LTE MONOPOLE';
          if (nb.towerType === '5G_POLE') {
            cssType = 'type-5g';
            svgFn = TOWER_5G_SVG;
            iconColor = '#00F0FF';
            towerLabel = '5G POLE';
          } else if (nb.towerType === 'SMALL_CELL') {
            cssType = 'type-small';
            svgFn = TOWER_SMALL_SVG;
            iconColor = '#39FF14';
            towerLabel = 'SMALL CELL';
          } else if (nb.towerType === 'MICROWAVE_HUB') {
            cssType = 'type-mw';
            svgFn = TOWER_MW_SVG;
            iconColor = '#E040FB';
            towerLabel = 'MICROWAVE';
          }

          var servingClass = nb.isServing ? ' is-serving' : '';
          var statusTag = nb.isServing ? '<span style="color:' + iconColor + ';">■ SERVING</span>' : '<span style="color:#8B929A;">○ NEIGHBOR</span>';

          // Icon marker
          var iconHtml = '<div class="neighbor-tower-container">'
            + '<div class="neighbor-icon ' + cssType + servingClass + '">'
            + svgFn(iconColor)
            + '</div>'
            + '<div class="neighbor-label ' + cssType + '">' + towerLabel + '</div>'
            + '</div>';

          var icon = L.divIcon({ html: iconHtml, className: '', iconSize: [1, 1] });
          var marker = L.marker(latLng(nb.location), { icon: icon, interactive: true }).addTo(neighborLayerGroup);

          // Popup with RF details
          var popupHtml = '<div class="popup-title ' + cssType + '">' + towerLabel + ' — ' + escapeHtml(nb.operatorName) + '</div>'
            + '<div>' + statusTag + ' | SIM ' + (nb.simSlot + 1) + '</div>'
            + '<div class="popup-row"><span class="popup-label">Network</span><span class="popup-value">' + escapeHtml(nb.networkType) + '</span></div>'
            + '<div class="popup-row"><span class="popup-label">PCI</span><span class="popup-value">' + (nb.pci || 'N/A') + '</span></div>'
            + '<div class="popup-row"><span class="popup-label">Cell ID</span><span class="popup-value">' + (nb.cellId || 'N/A') + '</span></div>'
            + '<div class="popup-row"><span class="popup-label">Band</span><span class="popup-value">' + (nb.band || 'N/A') + '</span></div>'
            + '<div class="popup-row"><span class="popup-label">RSRP</span><span class="popup-value" style="color:' + iconColor + ';">' + (nb.rsrp !== null ? nb.rsrp + ' dBm' : 'N/A') + '</span></div>'
            + '<div class="popup-row"><span class="popup-label">RSRQ</span><span class="popup-value">' + (nb.rsrq !== null ? nb.rsrq + ' dB' : 'N/A') + '</span></div>'
            + '<div class="popup-row"><span class="popup-label">SINR</span><span class="popup-value">' + (nb.sinr !== null ? nb.sinr + ' dB' : 'N/A') + '</span></div>'
            + '<div class="popup-row"><span class="popup-label">Est. Distance</span><span class="popup-value">' + formatDistance(nb.distanceMeters) + '</span></div>';
          marker.bindPopup(popupHtml, { className: 'neighbor-popup', maxWidth: 200 });

          // Dashed line from user to neighbor tower
          var lineColor = nb.isServing ? iconColor : 'rgba(255,255,255,0.25)';
          var lineWeight = nb.isServing ? 2 : 1;
          L.polyline([latLng(payload.user), latLng(nb.location)], {
            color: lineColor,
            dashArray: nb.isServing ? '6 4' : '3 6',
            interactive: false,
            opacity: nb.isServing ? 0.7 : 0.35,
            weight: lineWeight
          }).addTo(neighborLayerGroup);

          // Microwave backhaul beam from serving tower (aesthetic simulation)
          if (nb.isServing) {
            var mwBearing = (nb.bearing + 180) % 360;
            var mwDist = nb.distanceMeters * 2.5;
            var mwHub = destination(nb.location, mwBearing, mwDist);
            L.polyline([latLng(nb.location), [mwHub.latitude, mwHub.longitude]], {
              color: '#E040FB',
              dashArray: '2 6',
              interactive: false,
              opacity: 0.3,
              weight: 1
            }).addTo(neighborLayerGroup);

            // Microwave hub icon at the end
            var mwIconHtml = '<div class="neighbor-tower-container"><div class="neighbor-icon type-mw" style="width:20px;height:20px;">'
              + TOWER_MW_SVG('#E040FB')
              + '</div><div class="neighbor-label type-mw">MW HUB</div></div>';
            var mwIcon = L.divIcon({ html: mwIconHtml, className: '', iconSize: [1, 1] });
            L.marker([mwHub.latitude, mwHub.longitude], { icon: mwIcon, interactive: false }).addTo(neighborLayerGroup);
          }
        });
      }

      // Route segments
      routeLayerGroup.clearLayers();
      payload.route.forEach(function(segment) {
        if (!segment.points || segment.points.length < 2) return;
        L.polyline(segment.points.map(latLng), {
          color: segment.color,
          interactive: false,
          opacity: 0.92,
          weight: 5
        }).addTo(routeLayerGroup);
      });

      // Follow mode
      if (payload.followMode) {
        map.flyTo(latLng(payload.center), map.getZoom() < 13 ? 15 : map.getZoom(), {
          animate: true,
          duration: 0.75
        });
      }
    };

    window.ReactNativeWebView.postMessage("leaflet-ready");
  <\/script>
</body>
</html>
`;
}

/* =========================================================================
   STYLES
   ========================================================================= */

const styles = StyleSheet.create({
  screen: { backgroundColor: HUD.colors.bg, flex: 1 },

  /* Map */
  mapContainer: { flex: 1, minHeight: "45%" },
  map: { flex: 1 },
  operatorFloatingBadge: {
    ...HUD.glow.cyan,
    alignItems: "center",
    backgroundColor: "rgba(3, 7, 10, 0.86)",
    borderColor: HUD.colors.borderStrong,
    borderRadius: HUD.radius,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    left: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    position: "absolute",
    top: 12,
    zIndex: 10,
    maxWidth: 240,
  },
  operatorFloatingText: { color: HUD.colors.text, fontSize: 12, fontWeight: "900" },
  mapOverlayLabel: {
    backgroundColor: "rgba(3, 7, 10, 0.82)",
    borderColor: HUD.colors.border,
    borderRadius: HUD.radius,
    borderWidth: 1,
    bottom: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    position: "absolute",
  },
  mapOverlayText: { color: HUD.colors.textMuted, fontSize: 11, fontWeight: "700" },

  /* FABs */
  fabContainer: {
    bottom: 12,
    gap: 8,
    position: "absolute",
    right: 12,
  },
  fab: {
    ...HUD.glow.cyan,
    alignItems: "center",
    backgroundColor: "rgba(4, 9, 13, 0.9)",
    borderColor: HUD.colors.borderStrong,
    borderRadius: HUD.radius,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  fabActive: { backgroundColor: HUD.colors.cyan, borderColor: HUD.colors.cyan },
  fabDrive: { borderColor: HUD.colors.amberStrong },

  /* Bottom panel */
  bottomPanel: {
    ...HUD.glow.panel,
    backgroundColor: HUD.colors.bgAlt,
    borderTopColor: HUD.colors.border,
    borderTopWidth: 1,
    maxHeight: "55%",
  },

  /* GPS Bar */
  gpsBar: {
    borderBottomColor: HUD.colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingVertical: 8,
  },
  gpsItem: { alignItems: "center", flex: 1 },
  gpsLabel: { color: HUD.colors.textMuted, fontSize: 9, fontWeight: "800" },
  gpsValue: { color: HUD.colors.text, fontFamily: HUD.fonts.mono, fontSize: 12, fontWeight: "900", marginTop: 2, textAlign: "center" },
  gpsDivider: { backgroundColor: HUD.colors.border, width: 1 },

  /* Tab bar */
  tabBar: {
    borderBottomColor: HUD.colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
  },
  tab: {
    alignItems: "center",
    flex: 1,
    paddingVertical: 10,
  },
  tabActive: {
    borderBottomColor: HUD.colors.cyan,
    borderBottomWidth: 2,
  },
  tabText: {
    color: HUD.colors.textMuted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  tabTextActive: { color: HUD.colors.cyan },

  /* Tab content */
  tabContent: { flex: 1 },
  tabContentInner: { padding: 10, paddingBottom: 8 },

  /* SIM cards row */
  dashboardStack: { gap: 8 },
  simRow: { flexDirection: "row", gap: 8 },
  wifiStatusStrip: {
    ...HUD.glow.panel,
    alignItems: "center",
    backgroundColor: HUD.colors.panel,
    borderColor: HUD.colors.border,
    borderRadius: HUD.radius,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  wifiStatusText: { color: HUD.colors.text, flex: 1, fontSize: 12, fontWeight: "900" },

  /* Error */
  error: {
    backgroundColor: "rgba(255, 122, 0, 0.12)",
    borderColor: HUD.colors.amberStrong,
    borderRadius: HUD.radius,
    borderWidth: 1,
    color: HUD.colors.amber,
    fontSize: 11,
    marginBottom: 8,
    padding: 8
  },

  /* Connected Tower tab */
  towerTab: { gap: 10 },
  distanceCard: {
    ...HUD.glow.panel,
    alignItems: "center",
    backgroundColor: HUD.colors.panel,
    borderColor: HUD.colors.border,
    borderLeftWidth: 3,
    borderRadius: HUD.radius,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 12,
  },
  distanceInfo: { flex: 1 },
  distanceLabel: { color: HUD.colors.textMuted, fontSize: 10, fontWeight: "800" },
  distanceValue: { fontSize: 22, fontWeight: "900", marginTop: 2 },
  confidenceBadge: { alignItems: "center" },
  confidenceText: { color: HUD.colors.text, fontFamily: HUD.fonts.mono, fontSize: 16, fontWeight: "900" },
  confidenceLabel: { color: HUD.colors.textMuted, fontSize: 9, fontWeight: "700" },

  /* Tower metrics grid */
  towerMetrics: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  towerMetric: {
    ...HUD.glow.panel,
    backgroundColor: HUD.colors.panel,
    borderColor: HUD.colors.border,
    borderRadius: HUD.radius,
    borderWidth: 1,
    padding: 7,
    width: "31.5%",
  },
  towerMetricLabel: { color: HUD.colors.textMuted, fontSize: 8, fontWeight: "800" },
  towerMetricValue: { fontFamily: HUD.fonts.mono, fontSize: 12, fontWeight: "900", marginTop: 2 },

  /* Intelligence */
  intelSection: { gap: 8 },
  intelSectionTitle: { color: HUD.colors.cyan, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  intelRow: { flexDirection: "row", gap: 8 },
  intelBadge: {
    ...HUD.glow.panel,
    backgroundColor: HUD.colors.panel,
    borderColor: HUD.colors.border,
    borderRadius: HUD.radius,
    borderWidth: 1,
    flex: 1,
    padding: 8
  },
  intelBadgeActive: { borderColor: HUD.colors.cyan },
  intelBadgeLabel: { color: HUD.colors.textMuted, fontSize: 9, fontWeight: "800" },
  intelBadgeValue: { color: HUD.colors.text, fontFamily: HUD.fonts.mono, fontSize: 11, fontWeight: "900", marginTop: 2 },
  eventRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  eventFlag: {
    backgroundColor: HUD.colors.panelElevated,
    borderRadius: 5,
    color: HUD.colors.textMuted,
    fontSize: 10,
    fontWeight: "900",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  eventFlagActive: { backgroundColor: "rgba(255, 159, 28, 0.16)", color: HUD.colors.amber },
  sectionDivider: { backgroundColor: HUD.colors.border, height: 1, marginVertical: 14 },

  /* Logcat Overlay */
  terminalOverlay: {
    position: "absolute",
    top: 12,
    right: 12,
    width: "55%",
    maxHeight: 130,
    backgroundColor: "transparent",
    zIndex: 15,
  },
  terminalOverlayContent: {
    padding: 6,
    gap: 3,
  },
  terminalLine: {
    color: HUD.colors.phosphor,
    fontFamily: HUD.fonts.mono,
    fontSize: 9,
    lineHeight: 12,
    textShadowColor: "rgba(0, 0, 0, 0.9)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  terminalLineError: { color: HUD.colors.phosphor },
  terminalLineWarn: { color: HUD.colors.phosphor },

  /* Warning Container when monitoring is stopped */
  warningContainer: {
    alignItems: "center",
    backgroundColor: HUD.colors.bg,
    flex: 1,
    justifyContent: "center",
    padding: 24
  },
  warningCard: {
    ...HUD.glow.panel,
    alignItems: "center",
    backgroundColor: HUD.colors.panel,
    borderColor: HUD.colors.border,
    borderRadius: HUD.radius,
    borderWidth: 1,
    padding: 24,
    width: "100%",
    maxWidth: 340
  },
  warningIcon: {
    marginBottom: 16,
    shadowColor: HUD.colors.amber,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10
  },
  warningTitle: {
    color: HUD.colors.text,
    fontFamily: HUD.fonts.mono,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 10,
    textAlign: "center"
  },
  warningDescription: {
    color: HUD.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 20,
    textAlign: "center"
  },
  warningButton: {
    ...HUD.glow.cyan,
    alignItems: "center",
    backgroundColor: HUD.colors.cyan,
    borderRadius: HUD.radius,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 44,
    width: "100%"
  },
  warningButtonText: {
    color: HUD.colors.bg,
    fontSize: 13,
    fontWeight: "900"
  }
});
