import type Database from "better-sqlite3";

// Additive migration. The queue deliberately has no device FK: deletes need tombstones.
export function initializeMqttDynsecSchema(db: Database.Database) {
    db.transaction(() => {
        db.exec(`
            CREATE TABLE IF NOT EXISTS mqtt_device_credentials (
                device_code TEXT PRIMARY KEY REFERENCES devices(code) ON DELETE CASCADE,
                encrypted_password TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS mqtt_dynsec_queue (
                device_code TEXT PRIMARY KEY,
                revision INTEGER NOT NULL DEFAULT 1,
                attempts INTEGER NOT NULL DEFAULT 0,
                next_attempt_at INTEGER NOT NULL DEFAULT 0,
                last_error TEXT
            );
        `);

        for (const [table, column, update] of [
            ["devices", "code", "UPDATE OF activated, mqtt_enabled, owner_id, device_type_id"],
            ["mqtt_acl_rules", "device_code", "UPDATE"],
            ["mqtt_device_credentials", "device_code", "UPDATE"],
        ]) {
            for (const operation of ["INSERT", update, "DELETE"]) {
                const ref = operation === "DELETE" ? "OLD" : "NEW";
                const name = operation.split(" ")[0].toLowerCase();
                const condition = table === "devices" && operation === "INSERT"
                    ? "WHEN EXISTS (SELECT 1 FROM device_types WHERE id = NEW.device_type_id AND mqtt_enabled = 1)"
                    : "";
                // Refresh our triggers when the application evolves; their data stays in the queue.
                db.exec(`DROP TRIGGER IF EXISTS dynsec_${table}_${name}`);
                db.exec(`
                    CREATE TRIGGER IF NOT EXISTS dynsec_${table}_${name}
                    AFTER ${operation} ON ${table}
                    ${condition}
                    BEGIN
                        INSERT INTO mqtt_dynsec_queue(device_code) VALUES (${ref}.${column})
                        ON CONFLICT(device_code) DO UPDATE SET
                            revision = revision + 1, attempts = 0,
                            next_attempt_at = 0, last_error = NULL;
                    END;
                `);
            }
        }

        db.exec(`CREATE TRIGGER IF NOT EXISTS dynsec_device_type_mqtt_update
            AFTER UPDATE OF mqtt_enabled, mqttTopics ON device_types
            BEGIN
                INSERT INTO mqtt_dynsec_queue(device_code)
                    SELECT code FROM devices WHERE device_type_id = NEW.id
                ON CONFLICT(device_code) DO UPDATE SET revision = revision + 1,
                    attempts = 0, next_attempt_at = 0, last_error = NULL;
            END;`);
    })();
}
