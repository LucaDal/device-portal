import { DB } from "../config/database";

export const DeviceTypeController = {

  list(req: any, res: any) {
    const rows = DB.prepare("SELECT * FROM device_types").all();
    res.send(rows);
  },

  create(req: any, res: any) {
    const { description } = req.body;
    if (!description) return res.status(400).send({ error: "Missing description" });

    const stmt = DB.prepare("INSERT INTO device_types (description) VALUES (?)");
    const info = stmt.run(description);

    res.send({ id: info.lastInsertRowid, description });
  }
};
