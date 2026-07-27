import { Router } from "express";
import { settingsRepository } from "../db/index.js";
import { schedulerService } from "../services/SchedulerService.js";

export function settingsRoutes() {
  const router = Router();

  router.get("/settings", async (_req, res) => {
    res.json({
      settings: await settingsRepository.getAll(),
      scheduler: schedulerService.getState(),
    });
  });

  router.put("/settings", async (req, res) => {
    const patch = { ...(req.body || {}) };
    delete patch.schedule_enabled;
    delete patch.schedule_time;
    for (const key of Object.keys(patch)) {
      if (key.startsWith("smtp_")) delete patch[key];
    }

    if (Object.keys(patch).length) {
      await settingsRepository.setMany(patch);
    }

    const settings = await settingsRepository.getAll();
    const scheduler = await schedulerService.reschedule();
    res.json({ settings, scheduler });
  });

  return router;
}
