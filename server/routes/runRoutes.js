import { Router } from "express";
import {
  runRepository,
  batchRepository,
  logRepository,
} from "../db/index.js";
import { runEventService } from "../services/RunEventService.js";

export function runRoutes() {
  const router = Router();

  router.get("/runs", async (_req, res) => {
    res.json({
      active: await runRepository.listActive(),
      recent: await runRepository.list(80),
      batches: await batchRepository.recent(20),
    });
  });

  router.get("/runs/:id", async (req, res) => {
    const detail = await runEventService.getDetail(req.params.id);
    if (!detail) return res.status(404).json({ error: "not found" });
    res.json(detail);
  });

  router.get("/runs/:id/logs", async (req, res) => {
    const run = await runRepository.get(req.params.id);
    if (!run) return res.status(404).json({ error: "not found" });
    const logs = await logRepository.list(req.params.id, {
      stream: req.query.stream || null,
      limit: Number(req.query.limit || 8000),
    });
    res.json({ run, logs });
  });

  router.post("/runs/:id/events", async (req, res) => {
    const result = await runEventService.handle(req.params.id, req.body || {});
    if (result.error) return res.status(result.status || 400).json(result);
    res.json({ ok: true });
  });

  return router;
}
