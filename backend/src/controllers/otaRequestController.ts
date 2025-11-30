import { json } from "express";
import { DB } from "../config/database";
import crypto from "crypto";

export const OtaController = {

    getProperties(req: any, res: any) {
        const { dev_code } = req.params
        const data = DB.prepare(
            "SELECT properties FROM device_properties WHERE device_code = ?"
        ).get(dev_code);
        if(data){
            let props = JSON.parse((data as any).properties);
            res.json(props);
        }else{
            res.status(400).json({ error: "Device not found" });
        }
    },

    getBuildFromCode(req: any, res: any) {
        const { dev_code } = req.params
        const row = DB.prepare(
            `SELECT firmware_build FROM devices d
                JOIN device_types dt ON d.device_type_id = dt.id
                WHERE dev_code = ?`
            ).get(dev_code);
        if(!row){
            res.status(400).json({ error: "Device not found" });
        }

        // filename tipo "firmware.bin"
        const fileBuffer: Buffer = (row as any).firmware_build;

        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${encodeURIComponent("firmware.bin")}"`
        );
        return res.send(fileBuffer);
    },

    getBuildInfoFromCode(req: any, res: any) {
        const { dev_code } = req.params
        const data = DB.prepare(
            `SELECT firmware_version fv, firmware_build fb FROM devices d
                JOIN device_types dt ON d.device_type_id = dt.id
                WHERE dev_code = ?`
        ).get(dev_code);
        if(data){
            const fileBuffer: Buffer = (data as any).fb;
            const md5Checksum = crypto.createHash("md5")
                                .update(fileBuffer)
                                .digest("hex");
            res.json({version : (data as any).fv,
                      md5Checksum : md5Checksum});
        }else{
            res.status(400).json({ error: "Device not found" });
        }
    },
    UploadNewBuild(req: any, res: any) {
        const { token, version } = req.body;
        const file = req.file; // tipo Express.Multer.File | undefined

        if (!token || !version || !file) {
            return res.status(400).json({ error: "token, version or file missing" });
        }
        const data = DB.prepare(
            `UPDATE device_types SET
                firmware_build = ?
                firmware_version = ?
                WHERE dev_code = ?`
        ).get(file,version,token);
        if(data){
            return res.json({ ok: true });
        }else{
            res.status(400).json({ error: "Device not found" });
        }
    },
};


