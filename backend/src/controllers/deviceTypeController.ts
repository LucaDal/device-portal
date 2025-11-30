import { DB } from "../config/database";

export const DeviceTypeController = {

    list(req: any, res: any) {
        const rows = DB.prepare("SELECT id, description, firmware_version, created_at, properties FROM device_types").all();
        res.send(rows);
    },

    create(req: any, res: any) {
        if (req.file && req.file.size > 10 * 1024 * 1024) {
            return res.status(400).send({ error: "File too large (max 10MB)" });
        }

        const { id, description, firmware_version } = req.body;
        const firmware_build = req.file?.buffer;

        if (!id || !firmware_version || !firmware_build) {
            return res.status(400).send({ error: "Missing fields" });
        }

        const stmt = DB.prepare(`
                INSERT INTO device_types (id, firmware_version, firmware_build, description)
                VALUES (?, ?, ?, ?)
            `);

        const info = stmt.run(id, firmware_version, firmware_build, description);

        res.send({
            id: info.lastInsertRowid,
            description,
            firmware_version,
        });
    },

    // PUT /device-types/:id
    update(req: any, res: any) {
        const { id } = req.params;

        console.info(id);
        // Limite dimensione file: 10MB
        const MAX_SIZE = 10 * 1024 * 1024;
        if (req.file && req.file.size > MAX_SIZE) {
            return res
                .status(400)
                .json({ error: "File troppo grande (max 10MB)" });
        }

        const { description, firmware_version } = req.body;
        const firmware_build = req.file?.buffer ?? null;
        const propertiesJson = req.body.properties ?? "{}"; // stringa JSON

        if (!firmware_version?.trim()) {
            return res
                .status(400)
                .json({ error: "Campi obbligatori mancanti" });
        }

        // Validazione JSON di properties
        let properties = "{}";
        try {
            JSON.parse(propertiesJson); // solo per validare
            properties = propertiesJson;
        } catch {
            return res
                .status(400)
                .json({ error: "properties is not a valid JSON" });
        }

        // Verifica che il device type esista
        const existing = DB.prepare(
            "SELECT id FROM device_types WHERE id = ?"
        ).get(id);

        if (!existing) {
            return res
                .status(400)
                .json({ error: "Device type not found" });
        }

        // Costruzione dinamica dell'UPDATE
        const setClauses: string[] = [
            "description = ?",
            "firmware_version = ?",
            "properties = ?",
        ];
        const params: any[] = [description, firmware_version, properties];

        if (firmware_build) {
            setClauses.push("firmware_build = ?");
            params.push(firmware_build);
        }

        params.push(id);

        const stmt = DB.prepare(
            `UPDATE device_types
                SET ${setClauses.join(", ")}
                WHERE id = ?`
        );

        stmt.run(...params);

        const updated = DB.prepare(
            `SELECT id,
                description,
                firmware_version,
                properties,
                created_at
                FROM device_types
                WHERE id = ?`
        ).get(id);

        return res.json(updated);
    },
    // DELETE /device-types/:id
    delete(req: any, res: any) {
        const { id } = req.params;
        const stmt = DB.prepare("DELETE FROM device_types WHERE id = ?");
        const info = stmt.run(id);

        if (info.changes === 0) {
            return res.status(400).send({ error: "Device type not found" });
        }

        res.send({ success: true });
    },
};
