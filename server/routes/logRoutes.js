import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { tokenRepository, runRepository } from "../db/index.js";
import { fileLogService, LOG_ROOT } from "../services/FileLogService.js";

export function logRoutes() {
  const router = Router();

  router.get("/logs/browse", async (_req, res) => {
    res.json({
      users: await tokenRepository.listWithRunCounts(),
      runs: await runRepository.list(200),
    });
  });

  router.get("/logs", async (_req, res) => {
    const days = fileLogService.listDays();
    const latest = days[0];
    let entries = [];
    if (latest) {
      const dayDir = path.join(LOG_ROOT, latest);
      entries = fs
        .readdirSync(dayDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => {
          const metaPath = path.join(dayDir, d.name, "meta.json");
          let meta = {};
          if (fs.existsSync(metaPath)) {
            try {
              meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
            } catch {
              meta = {};
            }
          }
          return {
            day: latest,
            folder: d.name,
            path: path.join(dayDir, d.name),
            meta,
          };
        });
    }
    res.json({
      root: LOG_ROOT,
      days,
      entries,
      users: await tokenRepository.listWithRunCounts(),
      runs: await runRepository.list(200),
    });
  });

  return router;
}
