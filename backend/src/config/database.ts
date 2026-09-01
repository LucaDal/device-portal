import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import {
    DashboardWidgetValue,
    DeviceDashboardWidget,
    isDashboardWidgetValue,
    parseDeviceDashboardWidgets,
} from "@shared/types/device_type_mqtt";
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
        mqttTopics TEXT,
        description TEXT
    );

    CREATE TABLE IF NOT EXISTS devices (
        code TEXT PRIMARY KEY,
        device_type_id TEXT NOT NULL,
        owner_id INTEGER,
        activated INTEGER DEFAULT 0,
        device_secret_hash TEXT NOT NULL,
        mqtt_enabled INTEGER DEFAULT 1,
        FOREIGN KEY(owner_id) REFERENCES users(id),
        FOREIGN KEY(device_type_id) REFERENCES device_types(id)
    );
    CREATE TABLE IF NOT EXISTS device_properties (
        id INTEGER PRIMARY KEY,
        device_code TEXT NOT NULL,
        properties TEXT,
        FOREIGN KEY(device_code) REFERENCES devices(code) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS device_widgets (
        device_code TEXT NOT NULL,
        widget_id TEXT NOT NULL,
        label TEXT NOT NULL,
        kind TEXT NOT NULL,
        topic_key TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        state_topic_key TEXT,
        state_value_path TEXT,
        publish_value TEXT,
        on_value TEXT,
        off_value TEXT,
        payload TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(device_code, widget_id),
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
        source TEXT NOT NULL DEFAULT 'device_type_mqtt',
        source_key TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(device_code) REFERENCES devices(code) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS default_device_properties (
        key TEXT PRIMARY KEY,
        label TEXT,
        type TEXT NOT NULL,
        value TEXT NOT NULL,
        is_global INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS mqtt_user_acl_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        topic_pattern TEXT NOT NULL,
        permission TEXT NOT NULL DEFAULT 'allow',
        source TEXT NOT NULL DEFAULT 'generated',
        source_device_code TEXT,
        source_key TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(source_device_code) REFERENCES devices(code) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS device_request_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        event_type TEXT NOT NULL,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        status_code INTEGER,
        device_code TEXT,
        device_type_id TEXT,
        user_id INTEGER,
        user_email TEXT,
        topic TEXT,
        ip TEXT,
        user_agent TEXT,
        request_summary TEXT,
        response_summary TEXT,
        error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_device_share_invitations_lookup
    ON device_share_invitations(email, accepted_at, expires_at);

    CREATE INDEX IF NOT EXISTS idx_device_shares_user
    ON device_shares(user_id);

    CREATE INDEX IF NOT EXISTS idx_mqtt_acl_rules_device_priority
    ON mqtt_acl_rules(device_code, priority);

    CREATE INDEX IF NOT EXISTS idx_mqtt_user_acl_rules_user
    ON mqtt_user_acl_rules(user_id, action);

    CREATE INDEX IF NOT EXISTS idx_device_request_logs_created
    ON device_request_logs(created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_device_request_logs_type_created
    ON device_request_logs(event_type, created_at DESC);
`);

const userColumns = DB.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
if (!userColumns.some((c) => c.name === "must_change_password")) {
    DB.exec("ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0");
}
const deviceColumns = DB.prepare("PRAGMA table_info(devices)").all() as Array<{ name: string }>;
if (!deviceColumns.some((c) => c.name === "device_secret_hash")) {
    DB.exec("ALTER TABLE devices ADD COLUMN device_secret_hash TEXT");
}
if (!deviceColumns.some((c) => c.name === "mqtt_enabled")) {
    DB.exec("ALTER TABLE devices ADD COLUMN mqtt_enabled INTEGER DEFAULT 1");
}

const deviceTypeColumns = DB.prepare("PRAGMA table_info(device_types)").all() as Array<{ name: string }>;
if (!deviceTypeColumns.some((c) => c.name === "mqttTopics")) {
    DB.exec("ALTER TABLE device_types ADD COLUMN mqttTopics TEXT DEFAULT '[]'");
}

type LegacyWidgetBindingRow = {
    device_code: string;
    widget_id: string;
    topic_key: string | null;
    state_topic_key: string | null;
    state_value_path: string | null;
    publish_value: string | null;
    on_value: string | null;
    off_value: string | null;
};

function tableExists(tableName: string): boolean {
    return Boolean(DB.prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"
    ).get(tableName));
}

function parseLegacyScalar(raw: string | null): DashboardWidgetValue | undefined {
    if (raw === null) return undefined;
    try {
        const value = JSON.parse(raw);
        return isDashboardWidgetValue(value) ? value : undefined;
    } catch {
        return undefined;
    }
}

function mergeLegacyWidget(
    widget: DeviceDashboardWidget,
    binding?: LegacyWidgetBindingRow
): DeviceDashboardWidget {
    if (!binding) return widget;
    const publishValue = parseLegacyScalar(binding.publish_value);
    const onValue = parseLegacyScalar(binding.on_value);
    const offValue = parseLegacyScalar(binding.off_value);
    return {
        ...widget,
        ...(binding.topic_key ? { topicKey: binding.topic_key } : {}),
        ...(binding.state_topic_key ? { stateTopicKey: binding.state_topic_key } : {}),
        ...(binding.state_value_path ? { stateValuePath: binding.state_value_path } : {}),
        ...(typeof publishValue !== "undefined" ? { publishValue } : {}),
        ...(typeof onValue !== "undefined" ? { onValue } : {}),
        ...(typeof offValue !== "undefined" ? { offValue } : {}),
    };
}

function migrateLegacyDeviceWidgets() {
    const hasLegacyCatalog = deviceTypeColumns.some((column) => column.name === "dashboardWidgets");
    const hasLegacyBindings = tableExists("device_widget_bindings");
    if (!hasLegacyCatalog && !hasLegacyBindings) return;

    DB.transaction(() => {
        const bindings = hasLegacyBindings
            ? DB.prepare("SELECT * FROM device_widget_bindings").all() as LegacyWidgetBindingRow[]
            : [];
        const bindingByDeviceAndWidget = new Map(
            bindings.map((binding) => [`${binding.device_code}\u0000${binding.widget_id}`, binding])
        );
        const insertWidget = DB.prepare(`
            INSERT OR IGNORE INTO device_widgets (
                device_code,
                widget_id,
                label,
                kind,
                topic_key,
                position,
                state_topic_key,
                state_value_path,
                publish_value,
                on_value,
                off_value,
                payload
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        if (hasLegacyCatalog) {
            const rows = DB.prepare(`
                SELECT d.code AS deviceCode, dt.dashboardWidgets
                FROM devices d
                JOIN device_types dt ON dt.id = d.device_type_id
            `).all() as Array<{ deviceCode: string; dashboardWidgets?: string | null }>;

            for (const row of rows) {
                const catalogWidgets = parseDeviceDashboardWidgets(row.dashboardWidgets);
                for (const [position, catalogWidget] of catalogWidgets.entries()) {
                    const binding = bindingByDeviceAndWidget.get(
                        `${row.deviceCode}\u0000${catalogWidget.id}`
                    );
                    const widget = mergeLegacyWidget(catalogWidget, binding);
                    insertWidget.run(
                        row.deviceCode,
                        widget.id,
                        widget.label,
                        widget.kind,
                        widget.topicKey,
                        position,
                        widget.stateTopicKey || null,
                        widget.stateValuePath || null,
                        typeof widget.publishValue === "undefined" ? null : JSON.stringify(widget.publishValue),
                        typeof widget.onValue === "undefined" ? null : JSON.stringify(widget.onValue),
                        typeof widget.offValue === "undefined" ? null : JSON.stringify(widget.offValue),
                        widget.payload ? JSON.stringify(widget.payload) : null
                    );
                }
            }
        }

        if (hasLegacyBindings) {
            DB.exec("DROP TABLE device_widget_bindings");
        }
        if (hasLegacyCatalog) {
            DB.exec("ALTER TABLE device_types DROP COLUMN dashboardWidgets");
        }
    })();
}

migrateLegacyDeviceWidgets();

const mqttAclColumns = DB.prepare("PRAGMA table_info(mqtt_acl_rules)").all() as Array<{ name: string }>;
if (!mqttAclColumns.some((c) => c.name === "source")) {
    DB.exec("ALTER TABLE mqtt_acl_rules ADD COLUMN source TEXT NOT NULL DEFAULT 'device_type_mqtt'");
}
if (!mqttAclColumns.some((c) => c.name === "source_key")) {
    DB.exec("ALTER TABLE mqtt_acl_rules ADD COLUMN source_key TEXT");
}

ensureAdminUser();
