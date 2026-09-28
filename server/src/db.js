import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'coldchain.db');

fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('staff', 'supervisor')),
      display_name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS freezers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      location TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      freezer_id INTEGER NOT NULL REFERENCES freezers(id),
      lot_code TEXT NOT NULL,
      vaccine_name TEXT NOT NULL,
      doses INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      freezer_id INTEGER NOT NULL REFERENCES freezers(id),
      batch_id INTEGER NOT NULL REFERENCES batches(id),
      celsius REAL NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('safe', 'warning', 'critical')),
      recorded_at TEXT NOT NULL,
      recorded_by INTEGER NOT NULL REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reading_id INTEGER NOT NULL REFERENCES readings(id),
      freezer_id INTEGER NOT NULL REFERENCES freezers(id),
      batch_id INTEGER NOT NULL REFERENCES batches(id),
      level TEXT NOT NULL CHECK (level IN ('warning', 'critical')),
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      acknowledged_at TEXT,
      acknowledged_by INTEGER REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_readings_freezer_time ON readings(freezer_id, recorded_at);
    CREATE INDEX IF NOT EXISTS idx_alerts_freezer ON alerts(freezer_id, created_at);
  `);
}

export { dbPath };
