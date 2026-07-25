import { Router } from "express";
import { tokenRepository, runRepository } from "../db/index.js";
import { schedulerService } from "../services/SchedulerService.js";

export function tokenRoutes() {
  const router = Router();

  router.get("/tokens", async (_req, res) => {
    res.json({
      tokens: await tokenRepository.list(),
      scheduler: schedulerService.getState(),
    });
  });

  router.post("/tokens", async (req, res) => {
    const { label, refreshToken, scheduleEnabled, scheduleTime, scheduleTimezone } =
      req.body || {};
    if (!refreshToken) {
      return res.status(400).json({ error: "refreshToken required" });
    }
    try {
      const token = await tokenRepository.add({
        label,
        refreshToken,
        scheduleEnabled,
        scheduleTime,
        scheduleTimezone,
      });
      const scheduler = await schedulerService.reschedule();
      res.json({ token, scheduler });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  router.patch("/tokens/:id", async (req, res) => {
    const token = await tokenRepository.update(Number(req.params.id), req.body || {});
    if (!token) return res.status(404).json({ error: "not found" });
    const scheduler = await schedulerService.reschedule();
    res.json({ token, scheduler });
  });

  router.delete("/tokens/:id", async (req, res) => {
    await tokenRepository.delete(Number(req.params.id));
    const scheduler = await schedulerService.reschedule();
    res.json({ ok: true, scheduler });
  });

  router.get("/tokens/:id/runs", async (req, res) => {
    const runs = await runRepository.listForToken(Number(req.params.id), 80);
    res.json({ runs });
  });

  return router;
}
