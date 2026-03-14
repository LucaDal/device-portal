import express from "express";
import bodyParser from "body-parser";
import { logger } from "./middleware/logger";
import authRoutes from "./routes/authRoutes";
import deviceRoutes from "./routes/deviceRoutes";
import deviceTypeRoutes from "./routes/deviceTypeRoutes";
import managementRoutes from "./routes/managementRoute";
import otaRoutes from "./routes/otaRoutes";
import mqttRoutes from "./routes/mqttRoutes";
import "./config/database"; // inizializza DB
import { User } from "@shared/types/user";
import { securityHeadersMiddleware } from "./middleware/securityHeaders";
import { sensitiveIpRateLimitMiddleware } from "./middleware/rateLimit";

declare global {
  namespace Express {
    interface Request {
      user?: User;
      otaAuth?: {
        deviceCode?: string;
        deviceTypeId?: string;
      };
    }
  }
}

const app = express();
app.set("trust proxy", 1);

const ENABLE_REQUEST_LOGS = process.env.ENABLE_REQUEST_LOGS !== "false";
const ALLOWED_CORS_ORIGINS = String(process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

// CORS allowlist: only configured frontend origins are allowed cross-origin.
app.use(securityHeadersMiddleware);
app.use((req, res, next) => {
  const origin = req.headers.origin as string | undefined;
  const originAllowed = origin ? ALLOWED_CORS_ORIGINS.includes(origin) : true;

  if (origin && originAllowed) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Credentials", "true");
  }

  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Device-Code, X-Device-Type-Id, X-Device-Secret"
  );
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");

  if (req.method === "OPTIONS") {
    if (origin && !originAllowed) {
      return res.sendStatus(403);
    }
    return res.sendStatus(204);
  }

  if (origin && !originAllowed) {
    return res.status(403).send({ error: "CORS origin not allowed" });
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
app.use("/ota", sensitiveIpRateLimitMiddleware, otaRoutes);
app.use("/device-types", deviceTypeRoutes);
app.use("/mqtt", bodyParser.json(), sensitiveIpRateLimitMiddleware, mqttRoutes);

app.listen(3000, () => console.log("Server running on port 3000"));
