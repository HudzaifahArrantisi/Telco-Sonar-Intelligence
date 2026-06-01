import * as FileSystem from "expo-file-system";
import * as SQLite from "expo-sqlite";
import { DriveLog } from "@/types/telephony";

const db = SQLite.openDatabaseSync("telco_rf_monitor.db");

export function initLogStore(): void {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS drive_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      latitude REAL,
      longitude REAL,
      operator TEXT NOT NULL,
      networkType TEXT NOT NULL,
      cellId TEXT,
      tac TEXT,
      pci TEXT,
      band TEXT,
      rsrp INTEGER,
      rsrq INTEGER,
      sinr INTEGER,
      speed REAL,
      heading REAL,
      altitude REAL
    );
  `);
  try {
    db.execSync("ALTER TABLE drive_logs ADD COLUMN speed REAL;");
  } catch {}
  try {
    db.execSync("ALTER TABLE drive_logs ADD COLUMN heading REAL;");
  } catch {}
  try {
    db.execSync("ALTER TABLE drive_logs ADD COLUMN altitude REAL;");
  } catch {}
}

export async function insertLog(log: DriveLog): Promise<void> {
  await db.runAsync(
    `INSERT INTO drive_logs
      (timestamp, latitude, longitude, operator, networkType, cellId, tac, pci, band, rsrp, rsrq, sinr, speed, heading, altitude)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    log.timestamp,
    log.latitude,
    log.longitude,
    log.operator,
    log.networkType,
    log.cellId,
    log.tac,
    log.pci,
    log.band,
    log.rsrp,
    log.rsrq,
    log.sinr,
    log.speed ?? null,
    log.heading ?? null,
    log.altitude ?? null
  );
}

export async function getLogs(limit = 300): Promise<DriveLog[]> {
  return db.getAllAsync<DriveLog>("SELECT * FROM drive_logs ORDER BY timestamp DESC LIMIT ?", limit);
}

export async function clearLogs(): Promise<void> {
  await db.runAsync("DELETE FROM drive_logs");
}

export async function exportLogsCsv(): Promise<string> {
  const rows = await getLogs(5000);
  const header = "timestamp,latitude,longitude,operator,networkType,cellId,tac,pci,band,rsrp,rsrq,sinr,speed,heading,altitude";
  const body = rows
    .map((row) =>
      [
        row.timestamp,
        row.latitude ?? "",
        row.longitude ?? "",
        row.operator,
        row.networkType,
        row.cellId ?? "",
        row.tac ?? "",
        row.pci ?? "",
        row.band ?? "",
        row.rsrp ?? "",
        row.rsrq ?? "",
        row.sinr ?? "",
        row.speed ?? "",
        row.heading ?? "",
        row.altitude ?? ""
      ]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(",")
    )
    .join("\n");
  const uri = `${FileSystem.documentDirectory}telco-rf-drive-test-${Date.now()}.csv`;
  await FileSystem.writeAsStringAsync(uri, `${header}\n${body}`);
  return uri;
}
