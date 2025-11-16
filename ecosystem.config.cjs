/** @type {import('pm2').EcosystemFile} */
module.exports = {
  apps: [
    {
      name: "device-portal",
      script: "dist/server.js",            // entrypoint TS
      interpreter: "ts-node",            // esegue TypeScript
      watch: false,                        // riavvia se i file cambiano
      ignore_watch: ["node_modules", "data.db", "frontend"], // cartelle da ignorare
      env: {
        NODE_ENV: "development",
        PORT: 3000
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3000
      },
      // Log separati
      error_file: "./logs/device-portal-error.log",
      out_file: "./logs/device-portal-out.log",
      log_file: "./logs/device-portal-combined.log",
      merge_logs: true,
      autorestart: true,                  // riavvio automatico in caso di crash
      max_restarts: 10,                   // max tentativi
      min_uptime: "1000",                 // tempo minimo prima di considerare l'app stabile
    }
  ]
};