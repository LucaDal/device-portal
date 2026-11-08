import "dotenv/config";
import fs from "fs";
import path from "path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { openDatabase } from "../db/openDatabase";
import * as schema from "../db/schema";

const dbPath = path.resolve(process.env.DB_PATH || "data.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// The native connection is exposed for diagnostics and test fixtures.
export const DB = openDatabase(dbPath);
export const db = drizzle(DB, { schema });
