import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { apiRouter } from "./routes/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Express app factory (composition of routes + static UI). */
export function createApp({ auth } = {}) {
  if (!auth?.username || !auth?.password || !auth?.sessionSecret || !auth?.botToken) {
    throw new Error("createApp requires auth config");
  }

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "4mb" }));
  app.use("/api", apiRouter(auth));

  const adminDist = path.resolve(__dirname, "../admin/dist");
  app.use(express.static(adminDist));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) return next();
    res.sendFile(path.join(adminDist, "index.html"), (err) => {
      if (err) res.status(404).send("Build admin UI: npm run admin:build");
    });
  });

  return app;
}
