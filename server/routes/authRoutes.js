import { Router } from "express";
import { createRateLimiter } from "../auth/rateLimit.js";
import {
  clearSessionCookie,
  createSessionToken,
  getSessionFromRequest,
  setSessionCookie,
  verifyPassword,
} from "../auth/session.js";

export function authRoutes(authConfig) {
  const router = Router();
  const limiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 25 });

  router.get("/auth/me", (req, res) => {
    const session = getSessionFromRequest(req, authConfig.sessionSecret);
    if (!session) {
      return res.json({ authenticated: false });
    }
    res.json({
      authenticated: true,
      username: session.username,
      exp: session.exp,
    });
  });

  router.post("/auth/login", (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    const limited = limiter.check(`login:${ip}`);
    if (!limited.allowed) {
      res.setHeader(
        "Retry-After",
        String(Math.ceil(limited.retryAfterMs / 1000))
      );
      return res.status(429).json({ error: "too many login attempts" });
    }

    const username = String(req.body?.username || "");
    const password = String(req.body?.password || "");
    if (
      !verifyPassword(username, authConfig.username) ||
      !verifyPassword(password, authConfig.password)
    ) {
      return res.status(401).json({ error: "invalid username or password" });
    }

    const token = createSessionToken(username, authConfig.sessionSecret);
    setSessionCookie(res, token, { secure: authConfig.cookieSecure });
    res.json({ ok: true, username });
  });

  router.post("/auth/logout", (req, res) => {
    clearSessionCookie(res, { secure: authConfig.cookieSecure });
    res.json({ ok: true });
  });

  return router;
}
