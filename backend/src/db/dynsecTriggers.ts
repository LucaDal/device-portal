// Install broker synchronization triggers only when creating a fresh database.
export function buildMqttDynsecTriggersSql(): string {
    const statements: string[] = [];
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
            statements.push(`
                CREATE TRIGGER dynsec_${table}_${name}
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

    statements.push(`CREATE TRIGGER dynsec_device_type_mqtt_update
        AFTER UPDATE OF mqtt_enabled, mqttTopics ON device_types
        BEGIN
            INSERT INTO mqtt_dynsec_queue(device_code)
                SELECT code FROM devices WHERE device_type_id = NEW.id
            ON CONFLICT(device_code) DO UPDATE SET revision = revision + 1,
                attempts = 0, next_attempt_at = 0, last_error = NULL;
        END;`);
    return statements.join("\n");
}
