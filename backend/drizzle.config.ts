import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
    dialect: "sqlite",
    schema: "./src/db/schema/index.ts",
    dbCredentials: { url: process.env.DB_PATH || "data.db" },
});
