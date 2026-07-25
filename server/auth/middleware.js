import {
  getSessionFromRequest,
  verifyBearer,
} from "./session.js";

const PUBLIC_PATHS = new Set([
  "/health",
  "/auth/login",
  "/auth/logout",
  "/auth/me",
]);

/** Bot-only path pattern: POST /runs/:id/events */
function isBotEventPath(method, path) {
  return method === "POST" && /^\/runs\/[^/]+\/events$/.test(path);
}

export function createAuthMiddleware(authConfig) {
  return function requireAuth(req, res, next) {
    const path = req.path || "";

    if (req.method === "OPTIONS") return next();
    if (PUBLIC_PATHS.has(path)) return next();

    if (isBotEventPath(req.method, path)) {
      if (verifyBearer(req.headers.authorization, authConfig.botToken)) {
        req.auth = { kind: "bot" };
        return next();
      }
      // Also allow an admin session (manual debugging).
      const session = getSessionFromRequest(req, authConfig.sessionSecret);
      if (session) {
        req.auth = { kind: "session", username: session.username };
        return next();
      }
      return res.status(401).json({ error: "unauthorized" });
    }

    const session = getSessionFromRequest(req, authConfig.sessionSecret);
    if (session) {
      req.auth = { kind: "session", username: session.username };
      return next();
    }

    if (verifyBearer(req.headers.authorization, authConfig.botToken)) {
      // Bot token must not access admin UI APIs.
      return res.status(403).json({ error: "forbidden" });
    }

    return res.status(401).json({ error: "unauthorized" });
  };
}
