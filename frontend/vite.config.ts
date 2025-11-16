import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_BASE = process.env.VITE_API_BASE || "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ["deviceportal.lucadalessandro.freeddns.org","lolcalhost"],
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
