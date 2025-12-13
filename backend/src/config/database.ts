import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { ensureAdminUser } from "./bootstrap";

// Prefer user-provided DB path; fall back to a writable path inside the app directory
const FALLBACK_DB_PATH = path.resolve(process.cwd(), "data.db");
const envDbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : undefined;

function preparePath(targetPath: string): string {
    const dir = path.dirname(targetPath);
    fs.mkdirSync(dir, { recursive: true });
    return targetPath;
}

let dbPath = FALLBACK_DB_PATH;
if (envDbPath) {
    try {
        dbPath = preparePath(envDbPath);
    } catch (error) {
        console.warn(`DB_PATH "${envDbPath}" is not usable, falling back to "${FALLBACK_DB_PATH}".`, error);
        dbPath = preparePath(FALLBACK_DB_PATH);
    }
} else {
    dbPath = preparePath(FALLBACK_DB_PATH);
}

export const DB = new Database(dbPath);

DB.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        password_hash TEXT,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS device_types (
        id TEXT PRIMARY KEY,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        firmware_version TEXT NOT NULL,
        firmware_build BLOB NOT NULL,
        properties TEXT,
        description TEXT
    );

    CREATE TABLE IF NOT EXISTS devices (
        code TEXT PRIMARY KEY,
        device_type_id TEXT NOT NULL,
        owner_id INTEGER,
        activated INTEGER DEFAULT 0,
        FOREIGN KEY(owner_id) REFERENCES users(id),
        FOREIGN KEY(device_type_id) REFERENCES device_types(id)
    );
    CREATE TABLE IF NOT EXISTS device_properties (
        id INTEGER PRIMARY KEY,
        device_code INTEGER NOT NULL,
        properties TEXT,
        FOREIGN KEY(device_code) REFERENCES devices(code) ON DELETE CASCADE
    );
`);
ensureAdminUser();
