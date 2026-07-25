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
    // Global schedule_* flags are legacy; schedules live on each token.
    const patch = { ...(req.body || {}) };
    delete patch.schedule_enabled;
    delete patch.schedule_time;
    const settings = await settingsRepository.setMany(patch);
    // Timezone default can change armed jobs that inherit it.
    const scheduler = await schedulerService.reschedule();
    res.json({ settings, scheduler });
  });

  return router;
}
