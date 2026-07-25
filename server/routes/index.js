import { Router } from "express";
import { createAuthMiddleware } from "../auth/middleware.js";
import { authRoutes } from "./authRoutes.js";
import { healthRoutes } from "./healthRoutes.js";
import { settingsRoutes } from "./settingsRoutes.js";
import { tokenRoutes } from "./tokenRoutes.js";
import { streakRoutes } from "./streakRoutes.js";
import { runRoutes } from "./runRoutes.js";
import { logRoutes } from "./logRoutes.js";
import { fireRoutes } from "./fireRoutes.js";
import { streamRoutes } from "./streamRoutes.js";

export function apiRouter(authConfig) {
  const router = Router();
  router.use(createAuthMiddleware(authConfig));
  router.use(authRoutes(authConfig));
  router.use(healthRoutes());
  router.use(settingsRoutes());
  router.use(tokenRoutes());
  router.use(streakRoutes());
  router.use(runRoutes());
  router.use(logRoutes());
  router.use(fireRoutes());
  router.use(streamRoutes());
  return router;
}
