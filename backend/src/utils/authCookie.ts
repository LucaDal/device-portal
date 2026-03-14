import type { Request, Response } from "express";
import type { CookieOptions } from "express-serve-static-core";

export const AUTH_COOKIE_NAME = "device_portal_session";
const ONE_HOUR_MS = 60 * 60 * 1000;

function parseCookieHeader(rawHeader: string | undefined): Record<string, string> {
  if (!rawHeader) return {};

  return rawHeader.split(";").reduce<Record<string, string>>((acc, part) => {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex <= 0) return acc;

    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (!key) return acc;

    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function isSecureRequest(req: Request): boolean {
  if (req.secure) return true;
  return String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
}

export function getAuthCookieOptions(req: Request): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
    path: "/",
    maxAge: ONE_HOUR_MS,
  };
}

export function readAuthToken(req: Request): string | null {
  const cookies = parseCookieHeader(req.headers.cookie);
  const token = String(cookies[AUTH_COOKIE_NAME] || "").trim();
  return token || null;
}

export function setAuthCookie(req: Request, res: Response, token: string) {
  res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions(req));
}

export function clearAuthCookie(req: Request, res: Response) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    ...getAuthCookieOptions(req),
    maxAge: undefined,
  });
}
