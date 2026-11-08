import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { buildMqttDynsecTriggersSql } from "./dynsecTriggers";

const schemaSql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8") + buildMqttDynsecTriggersSql();
const schemaVersion = createHash("sha256").update(schemaSql).digest().readUInt32BE(0) & 0x7fffffff;

export function openDatabase(filename: string): Database.Database {
    const connection = new Database(filename);
    try {
        const hasTables = connection.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get();
        const version = connection.pragma("user_version", { simple: true });
        if (hasTables && version !== schemaVersion) {
            throw new Error("Database schema differs from the current schema. Set DB_PATH to a new database file; existing data has not been changed.");
        }
        connection.pragma("foreign_keys = ON");
        connection.pragma("journal_mode = WAL");
        connection.pragma("busy_timeout = 5000");
        if (!hasTables) {
            connection.transaction(() => {
                connection.exec(schemaSql);
                connection.pragma(`user_version = ${schemaVersion}`);
            })();
        }
        return connection;
    } catch (error) {
        connection.close();
        throw error;
    }
}
