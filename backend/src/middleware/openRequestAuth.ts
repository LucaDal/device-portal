import type { NextFunction, Request, Response } from "express";
import { DB } from "../config/database";
import { adminOnly } from "./adminOnly";
import { basicAuthMiddleware } from "./basicAuth";
import { verifyDeviceSecret } from "../utils/deviceSecrets";

export const OTA_DEVICE_CODE_HEADER = "x-device-code";
export const OTA_DEVICE_TYPE_ID_HEADER = "x-device-type-id";
export const OTA_DEVICE_SECRET_HEADER = "x-device-secret";

function readHeader(req: Request, headerName: string): string {
  const value = req.headers[headerName];
  return String(Array.isArray(value) ? value[0] : value || "").trim();
}

function missingHeader(res: Response, headerName: string) {
  return res.status(401).send({
    error: `Missing required header: ${headerName}`,
  });
}

function invalidDeviceAuth(res: Response) {
  return res.status(401).send({ error: "Invalid device credentials" });
}

function runMiddleware(
  req: Request,
  res: Response,
  middleware: (req: Request, res: Response, next: NextFunction) => unknown | Promise<unknown>
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      const result = middleware(req, res, () => finish(true));
      Promise.resolve(result)
        .then(() => finish(!res.headersSent))
        .catch(reject);
    } catch (error) {
      reject(error);
    }
  });
}

function loadDeviceByCode(deviceCode: string) {
  return DB.prepare(`
    SELECT code, device_type_id, device_secret_hash
    FROM devices
    WHERE code = ?
    LIMIT 1
  `).get(deviceCode) as
    | { code: string; device_type_id: string; device_secret_hash: string | null }
    | undefined;
}

function loadDevicesByType(deviceTypeId: string) {
  return DB.prepare(`
    SELECT code, device_type_id, device_secret_hash
    FROM devices
    WHERE device_type_id = ?
  `).all(deviceTypeId) as Array<{
    code: string;
    device_type_id: string;
    device_secret_hash: string | null;
  }>;
}

export function requireDeviceCodeSecret(req: Request, res: Response, next: NextFunction) {
  const deviceCode = readHeader(req, OTA_DEVICE_CODE_HEADER);
  if (!deviceCode) {
    return missingHeader(res, OTA_DEVICE_CODE_HEADER);
  }

  const deviceSecret = readHeader(req, OTA_DEVICE_SECRET_HEADER);
  if (!deviceSecret) {
    return missingHeader(res, OTA_DEVICE_SECRET_HEADER);
  }

  const device = loadDeviceByCode(deviceCode);
  if (!device?.device_secret_hash) {
    return invalidDeviceAuth(res);
  }

  if (!verifyDeviceSecret(deviceSecret, device.device_secret_hash)) {
    return invalidDeviceAuth(res);
  }

  req.otaAuth = {
    deviceCode: device.code,
    deviceTypeId: device.device_type_id,
  };
  next();
}

export function requireDeviceTypeSecret(req: Request, res: Response, next: NextFunction) {
  const deviceTypeId = readHeader(req, OTA_DEVICE_TYPE_ID_HEADER);
  if (!deviceTypeId) {
    return missingHeader(res, OTA_DEVICE_TYPE_ID_HEADER);
  }

  const deviceSecret = readHeader(req, OTA_DEVICE_SECRET_HEADER);
  if (!deviceSecret) {
    return missingHeader(res, OTA_DEVICE_SECRET_HEADER);
  }

  const device = loadDevicesByType(deviceTypeId).find(
    (row) => row.device_secret_hash && verifyDeviceSecret(deviceSecret, row.device_secret_hash)
  );
  if (!device) {
    return invalidDeviceAuth(res);
  }

  req.otaAuth = {
    deviceCode: device.code,
    deviceTypeId: device.device_type_id,
  };
  next();
}

export async function requireDeviceTypeSecretOrAdminBasic(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const deviceTypeId = readHeader(req, OTA_DEVICE_TYPE_ID_HEADER);
  if (!deviceTypeId) {
    return missingHeader(res, OTA_DEVICE_TYPE_ID_HEADER);
  }

  const deviceSecret = readHeader(req, OTA_DEVICE_SECRET_HEADER);
  if (deviceSecret) {
    return requireDeviceTypeSecret(req, res, next);
  }

  const authHeader = String(req.headers.authorization || "");
  if (!authHeader.startsWith("Basic ")) {
    return missingHeader(res, OTA_DEVICE_SECRET_HEADER);
  }

  req.otaAuth = { deviceTypeId };

  const basicOk = await runMiddleware(req, res, basicAuthMiddleware);
  if (!basicOk) return;

  const adminOk = await runMiddleware(req, res, adminOnly);
  if (!adminOk) return;

  next();
}

export function requireDeviceCodeTypeSecret(req: Request, res: Response, next: NextFunction) {
  const deviceCode = readHeader(req, OTA_DEVICE_CODE_HEADER);
  if (!deviceCode) {
    return missingHeader(res, OTA_DEVICE_CODE_HEADER);
  }

  const deviceTypeId = readHeader(req, OTA_DEVICE_TYPE_ID_HEADER);
  if (!deviceTypeId) {
    return missingHeader(res, OTA_DEVICE_TYPE_ID_HEADER);
  }

  const deviceSecret = readHeader(req, OTA_DEVICE_SECRET_HEADER);
  if (!deviceSecret) {
    return missingHeader(res, OTA_DEVICE_SECRET_HEADER);
  }

  const device = loadDeviceByCode(deviceCode);
  if (!device?.device_secret_hash) {
    return invalidDeviceAuth(res);
  }

  if (device.device_type_id !== deviceTypeId) {
    return invalidDeviceAuth(res);
  }

  if (!verifyDeviceSecret(deviceSecret, device.device_secret_hash)) {
    return invalidDeviceAuth(res);
  }

  req.otaAuth = {
    deviceCode: device.code,
    deviceTypeId: device.device_type_id,
  };
  next();
}

export function requireDeviceTypeIdHeader(req: Request, res: Response, next: NextFunction) {
  const deviceTypeId = readHeader(req, OTA_DEVICE_TYPE_ID_HEADER);
  if (!deviceTypeId) {
    return missingHeader(res, OTA_DEVICE_TYPE_ID_HEADER);
  }

  req.otaAuth = { deviceTypeId };
  next();
}
