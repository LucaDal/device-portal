import { DB } from "../config/database";
import {
    DefaultPropertyRow,
    parseDefaultPropertiesInput,
    rowsToDefaultProperties,
} from "../utils/defaultDeviceProperties";

export const DefaultPropertiesController = {
    list(_req: any, res: any) {
        const rows = DB.prepare(
            `SELECT key, label, type, value, is_global
             FROM default_device_properties
             ORDER BY key ASC`
        ).all() as DefaultPropertyRow[];

        return res.send(rowsToDefaultProperties(rows));
    },

    replace(req: any, res: any) {
        const parsed = parseDefaultPropertiesInput(req.body?.properties);
        if (!parsed.ok) {
            return res.status(400).send({ error: parsed.error });
        }

        DB.transaction(() => {
            DB.prepare("DELETE FROM default_device_properties").run();
            const insert = DB.prepare(`
                INSERT INTO default_device_properties (key, label, type, value, is_global, updated_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);
            for (const [key, entry] of Object.entries(parsed.properties)) {
                insert.run(key, entry.label || null, entry.type, String(entry.value), entry.global ? 1 : 0);
            }
        })();

        return res.send({ ok: true, properties: parsed.properties });
    },
};
