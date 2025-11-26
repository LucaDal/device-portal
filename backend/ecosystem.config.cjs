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
      },
      log_file: "../logs/dev_combined.log",
    },
    {
      name: "device-portal-prod",
      script: "dist/backend/src/server.js",
      interpreter: "node",
      interpreter_args: "-r tsconfig-paths/register",
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 3000
      },
      log_file: "../logs/prod_combined.log",
    }
  ]
};

