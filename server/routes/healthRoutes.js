import { Router } from "express";

export function healthRoutes() {
  const router = Router();
  router.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  router.get("/time", (_req, res) => {
    const now = new Date();
    const timezone =
      process.env.TZ ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      "UTC";
    res.json({
      iso: now.toISOString(),
      epochMs: now.getTime(),
      timezone,
      offsetMinutes: -now.getTimezoneOffset(),
    });
  });

  return router;
}

