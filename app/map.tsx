import { MapCoverageScreen } from "@/screens/MapCoverageScreen";
import { getLatestRuntimeState } from "@/services/runtimeState";

export default function MapRoute() {
  const { cells, location, settings } = getLatestRuntimeState();
  return <MapCoverageScreen location={location} cells={cells} settings={settings} />;
}
