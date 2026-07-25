import { Router } from "express";
import { tokenRepository, streakRepository } from "../db/index.js";
import { streakRefreshService } from "../services/StreakRefreshService.js";

export function streakRoutes() {
  const router = Router();

  router.get("/streaks", async (_req, res) => {
    res.json({ users: await tokenRepository.listUserStreaks() });
  });

  router.get("/streaks/history", async (req, res) => {
    const tokenId = req.query.tokenId ? Number(req.query.tokenId) : null;
    res.json({
      users: await streakRepository.byUser(40),
      logs: await streakRepository.listLogs({
        tokenId,
        limit: Number(req.query.limit || 200),
      }),
    });
  });

  router.post("/streaks/refresh", async (req, res) => {
    const result = await streakRefreshService.refresh({
      tokenIds: req.body?.tokenIds,
    });
    res.json(result);
  });

  return router;
}
