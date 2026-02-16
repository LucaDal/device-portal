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

    CREATE TABLE IF NOT EXISTS device_certificates (
        client_id TEXT PRIMARY KEY,
        device_code TEXT NOT NULL,
        cert_pem TEXT NOT NULL,
        cert_fingerprint_sha256 TEXT NOT NULL UNIQUE,
        secret_hash TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(device_code) REFERENCES devices(code) ON DELETE CASCADE
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

    CREATE INDEX IF NOT EXISTS idx_device_share_invitations_lookup
    ON device_share_invitations(email, accepted_at, expires_at);

    CREATE INDEX IF NOT EXISTS idx_device_shares_user
    ON device_shares(user_id);

    CREATE INDEX IF NOT EXISTS idx_device_certificates_device
    ON device_certificates(device_code);

    CREATE INDEX IF NOT EXISTS idx_mqtt_acl_rules_device_priority
    ON mqtt_acl_rules(device_code, priority);
`);

const userColumns = DB.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
if (!userColumns.some((c) => c.name === "must_change_password")) {
    DB.exec("ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0");
}

ensureAdminUser();
