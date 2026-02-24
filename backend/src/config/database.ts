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
DB.pragma("foreign_keys = ON");

DB.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        password_hash TEXT,
        role TEXT DEFAULT 'user',
        must_change_password INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS device_types (
        id TEXT PRIMARY KEY,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        firmware_version TEXT NOT NULL,
        firmware_build BLOB NOT NULL,
        deviceProperties TEXT,
        genericProperties TEXT,
        description TEXT
    );

    CREATE TABLE IF NOT EXISTS devices (
        code TEXT PRIMARY KEY,
        device_type_id TEXT NOT NULL,
        owner_id INTEGER,
        activated INTEGER DEFAULT 0,
        mqtt_enabled INTEGER DEFAULT 1,
        FOREIGN KEY(owner_id) REFERENCES users(id),
        FOREIGN KEY(device_type_id) REFERENCES device_types(id)
    );
    CREATE TABLE IF NOT EXISTS device_properties (
        id INTEGER PRIMARY KEY,
        device_code INTEGER NOT NULL,
        properties TEXT,
        FOREIGN KEY(device_code) REFERENCES devices(code) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_invitations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'user',
        otp_hash TEXT NOT NULL,
        invited_by INTEGER NOT NULL,
        expires_at DATETIME NOT NULL,
        accepted_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(invited_by) REFERENCES users(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS device_shares (
        device_code TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        can_write INTEGER NOT NULL DEFAULT 0,
        shared_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(device_code, user_id),
        FOREIGN KEY(device_code) REFERENCES devices(code) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(shared_by) REFERENCES users(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS device_share_invitations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_code TEXT NOT NULL,
        email TEXT NOT NULL,
        can_write INTEGER NOT NULL DEFAULT 0,
        invitation_token TEXT NOT NULL UNIQUE,
        invited_by INTEGER NOT NULL,
        expires_at DATETIME NOT NULL,
        accepted_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(device_code) REFERENCES devices(code) ON DELETE CASCADE,
        FOREIGN KEY(invited_by) REFERENCES users(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS mqtt_acl_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_code TEXT NOT NULL,
        action TEXT NOT NULL,
        topic_pattern TEXT NOT NULL,
        permission TEXT NOT NULL DEFAULT 'allow',
        priority INTEGER NOT NULL DEFAULT 100,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(device_code) REFERENCES devices(code) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS mqtt_publish_permissions (
        user_id INTEGER PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0,
        updated_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS mqtt_publish_acl_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        topic_pattern TEXT NOT NULL,
        permission TEXT NOT NULL DEFAULT 'allow',
        priority INTEGER NOT NULL DEFAULT 100,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_device_share_invitations_lookup
    ON device_share_invitations(email, accepted_at, expires_at);

    CREATE INDEX IF NOT EXISTS idx_device_shares_user
    ON device_shares(user_id);

    CREATE INDEX IF NOT EXISTS idx_mqtt_acl_rules_device_priority
    ON mqtt_acl_rules(device_code, priority);

    CREATE INDEX IF NOT EXISTS idx_mqtt_publish_acl_user_priority
    ON mqtt_publish_acl_rules(user_id, priority);
`);

const userColumns = DB.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
if (!userColumns.some((c) => c.name === "must_change_password")) {
    DB.exec("ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0");
}
const deviceColumns = DB.prepare("PRAGMA table_info(devices)").all() as Array<{ name: string }>;
if (!deviceColumns.some((c) => c.name === "mqtt_enabled")) {
    DB.exec("ALTER TABLE devices ADD COLUMN mqtt_enabled INTEGER DEFAULT 1");
}

ensureAdminUser();
