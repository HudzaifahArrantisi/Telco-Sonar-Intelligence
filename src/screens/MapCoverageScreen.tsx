import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import WebView from "react-native-webview";
import type { WebView as WebViewType } from "react-native-webview";
import { DrivePoint, distanceMeters, initialRfIntelligenceState, RfIntelligenceState, TowerEstimation, updateRfIntelligence } from "@/maps/rfIntelligence";
import { readActiveWifiSsid, readCells, readLocation, saveCurrentLog } from "@/services/telephonyService";
import { setLatestCells } from "@/services/runtimeState";
import { LocationPoint, Settings, TelephonyCell } from "@/types/telephony";
import { formatValue, getSignalColor, getSignalStatus } from "@/utils/signal";
import { SimCardPanel, WifiCard } from "@/components/SimCardPanel";

type Props = {
  location: LocationPoint | null;
  cells: TelephonyCell[];
  settings: Settings;
};

type TowerPayload = Pick<TowerEstimation, "location" | "confidence" | "dotted" | "radiusMeters" | "azimuth" | "beamwidth">;

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
};

type TabId = "dashboard" | "tower";

const FALLBACK = { latitude: -6.2, longitude: 106.816666 };

export function MapCoverageScreen({ location, cells: initialCells, settings }: Props) {
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
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [error, setError] = useState<string | null>(null);

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

  const distanceToTowerSim1 = useMemo(() => {
    if (!towerSim1 || !currentLocation) return null;
    return Math.round(distanceMeters(currentLocation, towerSim1.location));
  }, [currentLocation, towerSim1]);

  const distanceToTowerSim2 = useMemo(() => {
    if (!towerSim2 || !currentLocation) return null;
    return Math.round(distanceMeters(currentLocation, towerSim2.location));
  }, [currentLocation, towerSim2]);

  const refresh = useCallback(async () => {
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
      
      setRfState((previous) => updateRfIntelligence(previous, nextCells, nextLocation, settings.defaultRadius, settings.defaultBeamwidth));
      
      const registered = nextCells.find((nextCell) => nextCell.simSlot === selectedSimSlot && nextCell.isRegistered) ?? 
                         nextCells.find((nextCell) => nextCell.simSlot === selectedSimSlot) ?? 
                         nextCells.find((nextCell) => nextCell.isRegistered) ?? 
                         nextCells[0];
                         
      if (registered && (driveMode || settings.loggingEnabled)) {
        await saveCurrentLog(registered, nextLocation);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gagal memperbarui RF map.");
    }
  }, [driveMode, selectedSimSlot, settings.defaultBeamwidth, settings.defaultRadius, settings.loggingEnabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const intervalMs = Math.max(35, settings.updateIntervalSeconds) * 1000;
    const timer = setInterval(() => void refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [refresh, settings.updateIntervalSeconds]);

  const handleSelectSimSlot = useCallback((slot: number) => {
    setSelectedSimSlot(slot);
  }, []);

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
      operatorName: activeCell?.operatorName || (wifiSsid ? `WiFi: ${wifiSsid}` : "WiFi Network")
    }),
    [activeCell, color, distanceToTowerSim1, distanceToTowerSim2, followMode, origin, routeSegments, sim1Primary, sim2Primary, towerSim1, towerSim2, wifiSsid]
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

  return (
    <View style={styles.screen}>
      {/* ====== MAP AREA ====== */}
      <View style={styles.mapContainer}>
        <WebView
          ref={webViewRef}
          originWhitelist={["*"]}
          source={{ html: LEAFLET_HTML }}
          javaScriptEnabled
          domStorageEnabled
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
          <Ionicons name={wifiSsid ? "wifi" : "cellular"} size={14} color="#40E0C9" />
          <Text style={styles.operatorFloatingText} numberOfLines={1}>{activeOperatorTitle}</Text>
        </View>

        {/* Floating label */}
        <View style={styles.mapOverlayLabel}>
          <Text style={styles.mapOverlayText}>Azimuth and radius test</Text>
        </View>

        {/* Floating action buttons */}
        <View style={styles.fabContainer}>
          <Pressable
            onPress={() => setFollowMode((v) => !v)}
            style={[styles.fab, followMode && styles.fabActive]}
          >
            <Ionicons name={followMode ? "navigate" : "navigate-outline"} color={followMode ? "#061017" : "#F7FBFF"} size={18} />
          </Pressable>
          <Pressable onPress={recenter} style={styles.fab}>
            <Ionicons name="locate" color="#F7FBFF" size={18} />
          </Pressable>
          <Pressable
            onPress={() => setDriveMode((v) => !v)}
            style={[styles.fab, driveMode && styles.fabDrive]}
          >
            <Ionicons name={driveMode ? "stop-circle" : "radio-button-on"} color={driveMode ? "#FF5F6D" : "#F7FBFF"} size={18} />
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

        {/* Tab Bar */}
        <View style={styles.tabBar}>
          <Pressable
            onPress={() => setActiveTab("dashboard")}
            style={[styles.tab, activeTab === "dashboard" && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === "dashboard" && styles.tabTextActive]}>DASHBOARD</Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab("tower")}
            style={[styles.tab, activeTab === "tower" && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === "tower" && styles.tabTextActive]}>CONNECTED TOWER</Text>
          </Pressable>
        </View>

        {/* Tab Content */}
        <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentInner} showsVerticalScrollIndicator={false}>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {activeTab === "dashboard" ? (
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
          ) : (
            <ConnectedTowerTab
              cell={activeCell}
              tower={activeTower}
              towerDistanceM={selectedSimSlot === 1 ? distanceToTowerSim2 : distanceToTowerSim1}
              rfState={rfState}
              color={color}
            />
          )}
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
          <Ionicons name="wifi" size={14} color="#40E0C9" />
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

function TowerMetric({ label, value, accent = "#D7E1EA" }: { label: string; value: string; accent?: string }) {
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

/* =========================================================================
   HELPERS
   ========================================================================= */

function buildRouteSegments(points: DrivePoint[]) {
  return points.slice(1).map((point, index) => ({
    points: [points[index], point],
    color: signalColorForRsrp(point.rsrp)
  }));
}

function signalColorForRsrp(rsrp: number | null): string {
  if (typeof rsrp !== "number") return "#7E8A99";
  if (rsrp >= -95) return "#1FE0A2";
  if (rsrp >= -105) return "#FFD84D";
  return "#FF5F6D";
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

/* =========================================================================
   LEAFLET HTML WITH SONAR ANIMATION & SVG BTS MARKERS
   ========================================================================= */

const LEAFLET_HTML = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
  <style>
    html, body, #map { height: 100%; margin: 0; background: #061017; }
    .leaflet-container { background: #061017; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(0.62) contrast(1.28) saturate(0.7); }
    .leaflet-control-attribution { display: none; }

    /* User icon */
    .user-icon {
      align-items: center;
      border-radius: 999px;
      display: flex;
      justify-content: center;
      transform: translate(-50%, -50%);
      background: rgba(64, 224, 201, 0.24);
      border: 2px solid rgba(247, 251, 255, 0.9);
      box-shadow: 0 0 18px rgba(64, 224, 201, 0.5);
      height: 28px;
      width: 28px;
    }
    .user-icon::after {
      background: #40E0C9;
      border-radius: 999px;
      content: "";
      height: 12px;
      width: 12px;
    }

    /* Premium Futuristic SVG BTS Marker */
    .bts-marker-container {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      transform: translate(-50%, -50%);
      z-index: 1000 !important;
    }
    .bts-icon-premium {
      background: #0B1B26;
      border: 2.5px solid var(--bts-border-color, #40E0C9);
      border-radius: 50%;
      box-shadow: 0 0 20px var(--bts-glow-color, rgba(64, 224, 201, 0.6));
      color: var(--bts-border-color, #40E0C9);
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      padding: 6px;
      transition: all 0.3s ease;
    }

    /* Sonar animation */
    @keyframes sonarPulse {
      0% { transform: translate(-50%, -50%) scale(0.08); opacity: 0.75; }
      50% { opacity: 0.25; }
      100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
    }
    .sonar-container {
      position: relative;
      width: 320px;
      height: 320px;
      transform: translate(-50%, -50%);
      pointer-events: none;
    }
    .sonar-ring {
      position: absolute;
      border: 2px solid var(--sonar-color, #40E0C9);
      border-radius: 50%;
      width: 320px;
      height: 320px;
      top: 50%;
      left: 50%;
      animation: sonarPulse 3.5s ease-out infinite;
      pointer-events: none;
      box-shadow: inset 0 0 15px var(--sonar-color, #40E0C9), 0 0 15px var(--sonar-color, #40E0C9);
    }
    .sonar-ring:nth-child(2) { animation-delay: 1.1s; }
    .sonar-ring:nth-child(3) { animation-delay: 2.2s; }
    .sonar-ring.ring-fill {
      background: radial-gradient(circle, transparent 35%, var(--sonar-color, #40E0C9) 100%);
      opacity: 0.04;
      border: none;
      box-shadow: none;
    }

    /* Distance label */
    .distance-label {
      background: rgba(6, 16, 23, 0.92);
      border: 1px solid #40E0C9;
      border-radius: 6px;
      color: #40E0C9;
      font-size: 11px;
      font-weight: 900;
      padding: 4px 8px;
      white-space: nowrap;
      transform: translate(-50%, -50%);
      pointer-events: none;
      box-shadow: 0 0 12px rgba(64, 224, 201, 0.45);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
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
    let routeLayerGroup = L.layerGroup().addTo(map);

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
      const half = Math.max(16, Math.min(55, tower.beamwidth / 2));
      const left = destination(tower.location, beamBearing - half, tower.radiusMeters);
      const right = destination(tower.location, beamBearing + half, tower.radiusMeters);
      return [tower.location, left, right, tower.location].map(latLng);
    }

    // Futuristic SVG cell tower icon
    const TOWER_SVG = (color) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      + '<line x1="12" y1="2" x2="12" y2="22"></line>'
      + '<path d="M17 5c1.8 1.8 1.8 4.6 0 6.4"></path>'
      + '<path d="M19 2c3.5 3.5 3.5 9.1 0 12.7"></path>'
      + '<path d="M7 5c-1.8 1.8-1.8 4.6 0 6.4"></path>'
      + '<path d="M5 2c-3.5 3.5-3.5 9.1 0 12.7"></path>'
      + '<circle cx="12" cy="8" r="1.5" fill="' + color + '"></circle>'
      + '<path d="M8 22l4-6 4 6"></path>'
      + '</svg>';

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

    window.updateRfMap = function(payload) {
      // User marker
      userMarker = updateMarker(userMarker, payload.user, "", "user-icon");

      sectorLayerGroup.clearLayers();
      radiusLayerGroup.clearLayers();
      beamLayerGroup.clearLayers();
      distanceLayerGroup.clearLayers();

      ["sim1", "sim2"].forEach(function(key, index) {
        const tower = payload.towers ? payload.towers[key] : null;
        const label = key === "sim1" ? "SIM 1" : "SIM 2";
        if (!tower) {
          towerMarkers[key] = removeMarker(towerMarkers[key]);
          sonarMarkers[key] = removeMarker(sonarMarkers[key]);
          return;
        }

        const glowColor = colorForTower(payload, key);
        const towerHtml = '<div class="bts-marker-container" style="--bts-border-color: ' + glowColor + '; --bts-glow-color: ' + glowColor + '42;">'
          + '<div class="bts-icon-premium">'
          + TOWER_SVG(glowColor)
          + '</div>'
          + '</div>';
        towerMarkers[key] = updateMarker(towerMarkers[key], tower.location, towerHtml, "");

        const sonarHtml = '<div class="sonar-container" style="--sonar-color: ' + glowColor + ';">'
          + '<div class="sonar-ring"></div>'
          + '<div class="sonar-ring"></div>'
          + '<div class="sonar-ring"></div>'
          + '<div class="sonar-ring ring-fill"></div>'
          + '</div>';
        const sonarIcon = L.divIcon({ html: sonarHtml, className: "", iconSize: [320, 320] });
        if (sonarMarkers[key]) {
          sonarMarkers[key].setLatLng(latLng(tower.location));
          sonarMarkers[key].setIcon(sonarIcon);
        } else {
          sonarMarkers[key] = L.marker(latLng(tower.location), { icon: sonarIcon, interactive: false, zIndexOffset: -100 - index }).addTo(map);
        }

        L.polygon(sectorPolygon(tower, payload.user), {
          color: "#3B82F6",
          fillColor: "#3B82F6",
          fillOpacity: 0.22,
          interactive: false,
          opacity: 0.75,
          weight: 2
        }).addTo(sectorLayerGroup);

        L.circle(latLng(tower.location), {
          color: "#FFD84D",
          fillColor: "#FFD84D",
          fillOpacity: 0.015,
          interactive: false,
          radius: tower.radiusMeters,
          weight: 2,
          dashArray: "8 8"
        }).addTo(radiusLayerGroup);

        L.polyline([latLng(tower.location), latLng(payload.user)], {
          color: "#40E0C9",
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

/* =========================================================================
   STYLES
   ========================================================================= */

const styles = StyleSheet.create({
  screen: { backgroundColor: "#061017", flex: 1 },

  /* Map */
  mapContainer: { flex: 1, minHeight: "45%" },
  map: { flex: 1 },
  operatorFloatingBadge: {
    alignItems: "center",
    backgroundColor: "rgba(6, 16, 23, 0.88)",
    borderColor: "#1C3544",
    borderRadius: 18,
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
  operatorFloatingText: { color: "#F7FBFF", fontSize: 12, fontWeight: "900" },
  mapOverlayLabel: {
    backgroundColor: "rgba(6, 16, 23, 0.82)",
    borderColor: "#1C3544",
    borderRadius: 6,
    borderWidth: 1,
    bottom: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    position: "absolute",
  },
  mapOverlayText: { color: "#B9C4CF", fontSize: 11, fontWeight: "700" },

  /* FABs */
  fabContainer: {
    bottom: 12,
    gap: 8,
    position: "absolute",
    right: 12,
  },
  fab: {
    alignItems: "center",
    backgroundColor: "rgba(7, 19, 29, 0.88)",
    borderColor: "#24485C",
    borderRadius: 24,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  fabActive: { backgroundColor: "#40E0C9", borderColor: "#40E0C9" },
  fabDrive: { borderColor: "#FF5F6D" },

  /* Bottom panel */
  bottomPanel: {
    backgroundColor: "#07131D",
    borderTopColor: "#183341",
    borderTopWidth: 1,
    maxHeight: "55%",
  },

  /* GPS Bar */
  gpsBar: {
    borderBottomColor: "#12242F",
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingVertical: 8,
  },
  gpsItem: { alignItems: "center", flex: 1 },
  gpsLabel: { color: "#5A7A8A", fontSize: 9, fontWeight: "800" },
  gpsValue: { color: "#F7FBFF", fontSize: 12, fontWeight: "900", marginTop: 2, textAlign: "center" },
  gpsDivider: { backgroundColor: "#1C3544", width: 1 },

  /* Tab bar */
  tabBar: {
    borderBottomColor: "#12242F",
    borderBottomWidth: 1,
    flexDirection: "row",
  },
  tab: {
    alignItems: "center",
    flex: 1,
    paddingVertical: 10,
  },
  tabActive: {
    borderBottomColor: "#40E0C9",
    borderBottomWidth: 2,
  },
  tabText: {
    color: "#5A7A8A",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  tabTextActive: { color: "#40E0C9" },

  /* Tab content */
  tabContent: { flex: 1 },
  tabContentInner: { padding: 10, paddingBottom: 8 },

  /* SIM cards row */
  dashboardStack: { gap: 8 },
  simRow: { flexDirection: "row", gap: 8 },
  wifiStatusStrip: {
    alignItems: "center",
    backgroundColor: "#0B1B26",
    borderColor: "#1C3544",
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  wifiStatusText: { color: "#F7FBFF", flex: 1, fontSize: 12, fontWeight: "900" },

  /* Error */
  error: { backgroundColor: "#321820", borderRadius: 6, color: "#FFACB6", fontSize: 11, marginBottom: 8, padding: 8 },

  /* Connected Tower tab */
  towerTab: { gap: 10 },
  distanceCard: {
    alignItems: "center",
    backgroundColor: "#0B1B26",
    borderColor: "#1C3544",
    borderLeftWidth: 3,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 12,
  },
  distanceInfo: { flex: 1 },
  distanceLabel: { color: "#5A7A8A", fontSize: 10, fontWeight: "800" },
  distanceValue: { fontSize: 22, fontWeight: "900", marginTop: 2 },
  confidenceBadge: { alignItems: "center" },
  confidenceText: { color: "#F7FBFF", fontSize: 16, fontWeight: "900" },
  confidenceLabel: { color: "#5A7A8A", fontSize: 9, fontWeight: "700" },

  /* Tower metrics grid */
  towerMetrics: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  towerMetric: {
    backgroundColor: "#0B1B26",
    borderColor: "#1C3544",
    borderRadius: 6,
    borderWidth: 1,
    padding: 7,
    width: "31.5%",
  },
  towerMetricLabel: { color: "#5A7A8A", fontSize: 8, fontWeight: "800" },
  towerMetricValue: { fontSize: 12, fontWeight: "900", marginTop: 2 },

  /* Intelligence */
  intelSection: { gap: 8 },
  intelSectionTitle: { color: "#40E0C9", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  intelRow: { flexDirection: "row", gap: 8 },
  intelBadge: { backgroundColor: "#0B1B26", borderColor: "#1C3544", borderRadius: 6, borderWidth: 1, flex: 1, padding: 8 },
  intelBadgeActive: { borderColor: "#40E0C9" },
  intelBadgeLabel: { color: "#5A7A8A", fontSize: 9, fontWeight: "800" },
  intelBadgeValue: { color: "#F7FBFF", fontSize: 11, fontWeight: "900", marginTop: 2 },
  eventRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  eventFlag: {
    backgroundColor: "#111D27",
    borderRadius: 5,
    color: "#718091",
    fontSize: 10,
    fontWeight: "900",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  eventFlagActive: { backgroundColor: "#342419", color: "#FFD84D" },
});
