import { DB } from "../config/database";

export const DeviceController = {

    // GET /devices
    list(req: any, res: any) {
        const userId = Number((req.user as any).id);
        const role = (req.user as any).role;

        // query base (senza WHERE)
        let sql = `
            SELECT
                d.code,
                d.device_type_id,
                d.owner_id,
                d.activated,
                dt.description AS device_type_description,
                dt.firmware_version,
                dt.properties AS type_properties,
                dp.properties AS device_properties
            FROM devices d
            JOIN device_types dt ON dt.id = d.device_type_id
            LEFT JOIN device_properties dp ON dp.device_code = d.code
        `;

        const params: any[] = [];

        // se non è admin, filtro per owner
        if (role !== "admin") {
            sql += ` WHERE d.owner_id = ?`;
            params.push(userId);
        }

        sql += ` ORDER BY d.code ASC`;

        const stmt = DB.prepare(sql);
        const rows = stmt.all(...params);

        res.json(rows);
    },
    // POST /devices/register
    register(req: any, res: any) {
        const userId = Number((req.user as any).id);
        const { code } = req.body;

        const existing = DB.prepare(
            "SELECT * FROM devices WHERE code = ?"
        ).get(code);

        if (!existing) {
            return res.status(400).json({ message: "Device not found" });
        }

        const owned = DB.prepare("SELECT * FROM devices WHERE code = ? AND activated = 1").get(code);
        if(owned){
            return res.status(400).json({ message: "Device already activated"});
        }
        DB.prepare(`UPDATE devices SET owner_id = ?, activated = 1 WHERE code = ?`).run(userId, code);
        res.json({ok : true});
    },

    delete(req: any, res: any) {
        const { code } = req.params;
        const stmt = DB.prepare("DELETE FROM devices WHERE code = ?");
        const info = stmt.run(code);

        if (info.changes === 0) {
            return res.status(400).send({ message: "No device to delete found" });
        }
        res.send({ ok: true });
    },


    // POST /devices
    create(req: any, res: any) {
        const { code, device_type_id, owner_id, activated } = req.body;

        if (!code || !device_type_id) {
            return res
                .status(400)
                .json({ error: "code e device_type_id sono obbligatori" });
        }

        const stmt = DB.prepare(`
INSERT INTO devices (code, device_type_id, owner_id, activated)
VALUES (?, ?, ?, ?)
`);

        try {
            stmt.run(
                code,
                device_type_id,
                owner_id ?? null,
                activated ? 1 : 0
            );

            // riga iniziale per le properties del device
            DB.prepare(`
INSERT INTO device_properties (device_code, properties)
VALUES (?, ?)
`).run(code, "{}");

            const created = DB.prepare(`
SELECT code, device_type_id, owner_id, activated
FROM devices
WHERE code = ?
`).get(code);

            res.status(201).json(created);
        } catch (e: any) {
            if (e.code === "SQLITE_CONSTRAINT_PRIMARYKEY" || e.code === "SQLITE_CONSTRAINT_UNIQUE") {
                return res.status(400).json({ error: "code già esistente" });
            }
            console.error(e);
            res.status(500).json({ error: "Errore interno" });
        }
    },
    // PUT /devices/:code/properties
    updateProperties(req: any, res: any) {
        const { code } = req.params;
        const { properties } = req.body; // può essere stringa o oggetto

        if (!properties) {
            return res.status(400).json({ error: "properties mancante" });
        }

        let propertiesJson = "{}";
        try {
            const obj = typeof properties === "string" ? JSON.parse(properties) : properties;
            propertiesJson = JSON.stringify(obj);
        } catch {
            return res
                .status(400)
                .json({ error: "properties non è un JSON valido" });
        }

        const device = DB.prepare(
            "SELECT code FROM devices WHERE code = ?"
        ).get(code);

        if (!device) {
            return res.status(400).json({ error: "Device non trovato" });
        }

        const existingProps = DB.prepare(
            "SELECT id FROM device_properties WHERE device_code = ?"
        ).get(code);

        if (existingProps) {
            DB.prepare(`
UPDATE device_properties
SET properties = ?
WHERE device_code = ?
`).run(propertiesJson, code);
        } else {
            DB.prepare(`
INSERT INTO device_properties (device_code, properties)
VALUES (?, ?)
`).run(code, propertiesJson);
        }

        res.json({ ok: true });
    },


    getProperties(req: any, res: any) {
        const { code } = req.params
        const data = DB.prepare(
            "SELECT properties FROM device_properties WHERE device_code = ?"
        ).get(code);
        if(data){
            res.json((data as any).properties);
        }else{
            res.status(400).json({ error: "Device not found" });
        }
    }
};


