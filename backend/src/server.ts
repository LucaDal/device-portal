import express from "express";
import bodyParser from "body-parser";
import { logger } from "./middleware/logger";
import authRoutes from "./routes/authRoutes";
import deviceRoutes from "./routes/deviceRoutes";
import deviceTypeRoutes from "./routes/deviceTypeRoutes";
import managementRoutes from "./routes/managementRoute";
import otaRoutes from "./routes/otaRoutes";
import "./config/database"; // inizializza DB
import { JwtPayload } from "jsonwebtoken";

declare global {
  namespace Express {
    interface Request {
      user?: string | JwtPayload;
    }
  }
}

const app = express();

const ENABLE_REQUEST_LOGS = process.env.ENABLE_REQUEST_LOGS !== "false";

// Minimal CORS handling for frontend → backend calls
app.use((req, res, next) => {
  const origin = req.headers.origin as string | undefined;
  if (origin) {
    // Reflect the caller's origin so deployments work on any host/IP without config
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
  }
  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// Keep request logging optional to avoid noisy logs in production
if (ENABLE_REQUEST_LOGS) {
  app.use(logger);
}
// Routes
app.use("/auth", bodyParser.json(),  authRoutes);
app.use("/manage", bodyParser.json(), managementRoutes);
app.use("/devices", bodyParser.json(), deviceRoutes);
app.use("/ota", otaRoutes);
app.use("/device-types", deviceTypeRoutes);

app.listen(3000, () => console.log("Server running on port 3000"));
