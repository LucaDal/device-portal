import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_BASE = process.env.VITE_API_BASE || "http://localhost:3000";
const API_DOMAIN = process.env.VITE_DOMAIN || "";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [API_DOMAIN,"localhost"],
    port: 5173,
    proxy: {
      "/api": {
        target: API_BASE,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "")
      }
    }
  }
});
