import express from "express";
import bodyParser from "body-parser";
import { logger } from "./middleware/logger";
import authRoutes from "./routes/authRoutes";
import deviceRoutes from "./routes/deviceRoutes";
import deviceTypeRoutes from "./routes/deviceTypeRoutes";
import managementRoutes from "./routes/managementRoute";
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
app.use(logger);

// Routes
app.use("/auth", bodyParser.json(),  authRoutes);
app.use("/manage", bodyParser.json(), managementRoutes);
app.use("/devices", bodyParser.json(), deviceRoutes);
app.use("/device-types", deviceTypeRoutes);

app.listen(3000, () => console.log("Server running on port 3000"));
