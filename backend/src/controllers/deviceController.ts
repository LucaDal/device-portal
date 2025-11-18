import { DB } from "../config/database";

export const DeviceController = {

  list(req: any, res: any) {
    const rows = DB.prepare("SELECT * FROM devices WHERE owner_id = ?").all((req.user as any).id);
    res.send(rows);
  },

  create(req: any, res: any) {
    const device = req.body;

    const stmt = DB.prepare(`
      INSERT INTO devices (owner_id, device_type_id, firmware_version, firmware_build)
      VALUES (?, ?, ?, ?)
    `);

    const info = stmt.run(
      (req.user as any).id,
      device.device_type_id,
      device.firmware_version,
      device.firmware_build
    );

    res.send({ id: info.lastInsertRowid });
  }
};
