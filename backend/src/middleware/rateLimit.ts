import type { NextFunction, Request, Response } from "express";

type RateLimitOptions = {
  id: string;
  windowMs: number;
  max: number;
  message: string;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
};

type Entry = {
  count: number;
  resetAt: number;
};

const stores = new Map<string, Map<string, Entry>>();

function getStore(id: string): Map<string, Entry> {
  let store = stores.get(id);
  if (!store) {
    store = new Map<string, Entry>();
    stores.set(id, store);
  }
  return store;
}

function defaultKeyGenerator(req: Request): string {
  return String(req.ip || req.socket.remoteAddress || "unknown");
}

export function createRateLimitMiddleware(options: RateLimitOptions) {
  const store = getStore(options.id);
  const keyGenerator = options.keyGenerator || defaultKeyGenerator;

  return (req: Request, res: Response, next: NextFunction) => {
    if (options.skip?.(req)) {
      return next();
    }

    const now = Date.now();
    const key = keyGenerator(req);
    const current = store.get(key);

    if (!current || current.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    if (current.count >= options.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).send({ error: options.message });
    }

    current.count += 1;
    next();
  };
}

function readNormalizedEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export const loginRateLimitMiddleware = createRateLimitMiddleware({
  id: "auth-login",
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many login attempts. Retry later.",
  keyGenerator: (req) => {
    const ip = defaultKeyGenerator(req);
    const email = readNormalizedEmail(req.body?.email);
    return `${ip}:${email || "unknown-email"}`;
  },
});

export const sensitiveIpRateLimitMiddleware = createRateLimitMiddleware({
  id: "sensitive-routes",
  windowMs: 60 * 1000,
  max: 30,
  message: "Too many requests. Retry later.",
});
