import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const API_BASE = process.env.VITE_API_BASE || "http://localhost:3000";
const API_DOMAIN = process.env.VITE_DOMAIN || "";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    allowedHosts: [API_DOMAIN, "localhost"],
    port: 5173,
    proxy: {
      "/api": {
        target: API_BASE,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "")
      }
    },
    fs: mode === "development" ? {
      // permette al dev server di leggere frontend + shared
      allow: [
        path.resolve(__dirname),           // frontend root
        path.resolve(__dirname, "../shared") // shared
      ]
    } : undefined,
    watch: mode === "development" ? {
      // assicura che Vite watchi anche shared
      ignored: ["!../shared/**"]
    } : undefined
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared") // alias per vite
    }
  }
}));

