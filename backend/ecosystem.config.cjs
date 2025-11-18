/** @type {import('pm2').EcosystemFile} */
module.exports = {
  apps: [
    {
      name: "device-portal-dev",
      script: "src/server.ts",
      interpreter: "ts-node",
      interpreter_args: "-r tsconfig-paths/register",
      watch: ["src", "../shared"],
      ignore_watch: ["node_modules", "dist", "frontend", "data.db"],
      env: {
        NODE_ENV: "development",
        PORT: 3000
      }
    },
    {
      name: "device-portal-prod",
      script: "dist/backend/src/server.js",
      interpreter: "node",
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 3000
      }
    }
  ]
};

