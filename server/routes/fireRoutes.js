import { Router } from "express";
import { batchFireService } from "../services/BatchFireService.js";
import { eventBus } from "../shared/EventBus.js";

export function fireRoutes() {
  const router = Router();

  router.post("/fire", (req, res) => {
    batchFireService
      .fire({
        kind: "manual",
        tokenIds: req.body?.tokenIds || null,
        maxParallel: req.body?.maxParallel,
        staggerSeconds: req.body?.staggerSeconds,
      })
      .then((result) => eventBus.emit("batch", result))
      .catch((err) => {
        console.error("[fire]", err.message);
        eventBus.emit("error", { message: err.message });
      });
    res.json({ ok: true, message: "batch starting" });
  });

  return router;
}
