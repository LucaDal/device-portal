import { listDefaultProperties, replaceDefaultProperties } from "../repositories/settingsRepository";
import {
    parseDefaultPropertiesInput,
    rowsToDefaultProperties,
} from "../utils/defaultDeviceProperties";

export const DefaultPropertiesController = {
    list(_req: any, res: any) {
        const rows = listDefaultProperties();

        return res.send(rowsToDefaultProperties(rows));
    },

    replace(req: any, res: any) {
        const parsed = parseDefaultPropertiesInput(req.body?.properties);
        if (!parsed.ok) {
            return res.status(400).send({ error: parsed.error });
        }

        replaceDefaultProperties(parsed.properties);

        return res.send({ ok: true, properties: parsed.properties });
    },
};
