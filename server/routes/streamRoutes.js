import { Router } from "express";
import { runRepository } from "../db/index.js";
import { eventBus } from "../shared/EventBus.js";

export function streamRoutes() {
  const router = Router();
  const sseClients = new Set();

  eventBus.subscribe((evt) => {
    const line = `data: ${JSON.stringify(evt)}\n\n`;
    for (const res of sseClients) res.write(line);
  });

  router.get("/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    runRepository.listActive().then((active) => {
      res.write(
        `data: ${JSON.stringify({ type: "hello", data: { active } })}\n\n`
      );
    });
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
  });

  return router;
}
