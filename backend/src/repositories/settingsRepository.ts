import { sql } from "drizzle-orm";
import { db } from "../config/database";
import { defaultDeviceProperties } from "../db/schema";
import type { SavedProperties } from "@shared/types/properties";

export function listDefaultProperties() {
    return db.select().from(defaultDeviceProperties).orderBy(defaultDeviceProperties.key).all();
}

const insertDefaultProperty = db.insert(defaultDeviceProperties).values({
    key: sql.placeholder("key"), label: sql.placeholder("label"), type: sql.placeholder("type"),
    value: sql.placeholder("value"), is_global: sql.placeholder("is_global"),
}).prepare();

export function replaceDefaultProperties(properties: SavedProperties) {
    db.transaction(() => {
        db.delete(defaultDeviceProperties).run();
        for (const [key, entry] of Object.entries(properties)) {
            insertDefaultProperty.run({ key, label: entry.label || null, type: entry.type,
                value: String(entry.value), is_global: entry.global ? 1 : 0 });
        }
    });
}
