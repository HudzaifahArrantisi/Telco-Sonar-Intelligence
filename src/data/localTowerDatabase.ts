import { LocationPoint, TelephonyCell } from "@/types/telephony";

export type LocalTowerRadio = TelephonyCell["networkType"];
export type LocalTowerType = "macro" | "small_cell" | "monopole" | "unknown";
export type LocalTowerSource = "manual" | "opencellid" | "survey" | "estimated";

export type LocalTowerCellRecord = {
  id: string;
  mcc: string;
  mnc: string;
  tac?: string | null;
  lac?: string | null;
  cellId: string;
  pci?: string | null;
  radio: LocalTowerRadio;
  latitude: number;
  longitude: number;
  towerType: LocalTowerType;
  source: LocalTowerSource;
  label?: string;
  address?: string;
  band?: string | null;
};

// Sample Indonesia MCC 510 records. Replace these with manual survey,
// OpenCelliD-style imports, or drive-test estimated cells for real usage.
export const localTowerDatabase: LocalTowerCellRecord[] = [
  {
    id: "id-jkt-sample-lte-001",
    mcc: "510",
    mnc: "10",
    tac: "3187",
    cellId: "12345678",
    pci: "87",
    radio: "LTE",
    latitude: -6.20042,
    longitude: 106.81662,
    towerType: "monopole",
    source: "manual",
    label: "Sample Jakarta LTE monopole",
    address: "Sample point near Jakarta center, replace with surveyed site address",
    band: "3"
  },
  {
    id: "id-jkt-sample-nr-001",
    mcc: "510",
    mnc: "11",
    tac: "4201",
    cellId: "987654321",
    pci: "321",
    radio: "NR",
    latitude: -6.20103,
    longitude: 106.81732,
    towerType: "small_cell",
    source: "survey",
    label: "Sample Jakarta 5G small cell",
    address: "Sample 5G survey point, replace with real site address",
    band: "n78"
  },
  {
    id: "id-bdg-sample-lte-001",
    mcc: "510",
    mnc: "01",
    tac: "2099",
    cellId: "44556677",
    pci: "144",
    radio: "LTE",
    latitude: -6.91474,
    longitude: 107.60981,
    towerType: "macro",
    source: "opencellid",
    label: "Sample Bandung macro",
    address: "Sample Bandung point, replace with real site address",
    band: "8"
  }
];

export function towerRecordLocation(record: LocalTowerCellRecord): LocationPoint {
  return {
    latitude: record.latitude,
    longitude: record.longitude
  };
}
