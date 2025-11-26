import Database from "better-sqlite3";
import { ensureAdminUser} from "./bootstrap";

export const DB = new Database("./data.db");

DB.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE,
  password_hash TEXT,
  role TEXT DEFAULT 'user',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS device_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT
);

CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_type_id INTEGER NOT NULL,
  firmware_version TEXT,
  firmware_build BLOB,
  owner_id INTEGER,
  activated INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(owner_id) REFERENCES users(id),
  FOREIGN KEY(device_type_id) REFERENCES device_types(id)
);
`);
ensureAdminUser();
