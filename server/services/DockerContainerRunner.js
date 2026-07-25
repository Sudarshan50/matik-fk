import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { runRepository } from "../db/index.js";
import { eventBus } from "../shared/EventBus.js";
import { fileLogService } from "./FileLogService.js";
import { createRunLogWriter } from "./RunLogWriter.js";

const execFileAsync = promisify(execFile);

/** One shared image for every user/token — never rebuild per fire. */
export const BOT_IMAGE =
  process.env.BOT_IMAGE || "matik-fk-bot:latest";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function projectDir() {
  return process.env.COMPOSE_PROJECT_DIR || path.resolve(".");
}

export async function botImageExists() {
  try {
    await execFileAsync("docker", ["image", "inspect", BOT_IMAGE], {
      timeout: 15000,
    });
    return true;
  } catch {
    return false;
  }
}

let imageReadyPromise = null;

/**
 * Ensure the shared bot image exists.
 * - If already local → skip build entirely (all users reuse cache)
 * - Else build once with BuildKit layer cache
 */
export async function ensureBotImage({ force = false } = {}) {
  if (!force && imageReadyPromise) return imageReadyPromise;

  imageReadyPromise = (async () => {
    if (!force && (await botImageExists())) {
      console.log(`[docker] cache hit — reusing ${BOT_IMAGE}`);
      return { image: BOT_IMAGE, cached: true };
    }

    console.log(`[docker] building ${BOT_IMAGE} once (BuildKit cache)…`);
    const cwd = projectDir();
    await execFileAsync(
      "docker",
      ["build", "-t", BOT_IMAGE, "-f", "Dockerfile", "."],
      {
        cwd,
        env: {
          ...process.env,
          DOCKER_BUILDKIT: "1",
          BUILDKIT_PROGRESS: "plain",
        },
        timeout: 45 * 60 * 1000,
        maxBuffer: 32 * 1024 * 1024,
      }
    );

    if (!(await botImageExists())) {
      throw new Error(`Build finished but image missing: ${BOT_IMAGE}`);
    }
    console.log(`[docker] image ready: ${BOT_IMAGE}`);
    return { image: BOT_IMAGE, cached: false };
  })().catch((err) => {
    imageReadyPromise = null;
    throw err;
  });

  return imageReadyPromise;
}

/** Warm cache at admin boot so the first Fire is instant. */
export function warmBotImageInBackground() {
  ensureBotImage().catch((err) => {
    console.warn("[docker] background image warm failed:", err.message);
  });
}

async function removeContainer(name, { forceLog, logFile, writer } = {}) {
  try {
    await execFileAsync("docker", ["rm", "-f", name], { timeout: 20000 });
    if (forceLog) {
      const msg = `FAILSAFE kill/rm: ${name}`;
      if (logFile) fileLogService.append(logFile, msg);
      if (writer) await writer.log(msg, { level: "warn", stream: "events" });
      eventBus.emit("log", { container: name, chunk: `killed ${name}\n` });
    }
    return true;
  } catch (err) {
    if (forceLog) {
      const msg = `kill skipped/failed for ${name}: ${err.message}`;
      if (logFile) fileLogService.append(logFile, msg);
      if (writer) await writer.log(msg, { level: "warn", stream: "events" });
    }
    return false;
  }
}

/**
 * Launch from the shared cached image via `docker run`.
 * Per-user data is ONLY env vars — no rebuild, no compose bake.
 */
function runDockerOnce({ name, env, logPaths, failsafeMs, runId, writer }) {
  return new Promise((resolve) => {
    const finding = path.join(projectDir(), "finding.txt");
    if (!fs.existsSync(finding)) {
      fs.writeFileSync(finding, "", "utf8");
    }
    const args = [
      "run",
      "--rm",
      "--name",
      name,
      "--shm-size",
      "1g",
      "--add-host",
      "host.docker.internal:host-gateway",
      "-v",
      `${finding}:/app/finding.txt:ro`,
      ...Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
      BOT_IMAGE,
    ];

    const startMsg = `CONTAINER_START name=${name} image=${BOT_IMAGE} (cached docker run)`;
    fileLogService.append(logPaths.events, startMsg);
    writer.log(startMsg, { stream: "events" });
    fileLogService.writeMeta(logPaths.meta, {
      container: name,
      image: BOT_IMAGE,
      startedAt: new Date().toISOString(),
      env: {
        BOT_LABEL: env.BOT_LABEL,
        RUN_ID: env.RUN_ID,
        TOKEN_ID: env.TOKEN_ID,
        MATCH_LOOPS: env.MATCH_LOOPS,
      },
    });

    const child = spawn("docker", args, {
      cwd: projectDir(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let logs = "";
    let settled = false;
    let timer = null;

    const finish = async (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);

      await writer.flush();

      // Force-kill only on failsafe/timeout. Normal exit already tears down --rm.
      if (result.reason === "failsafe_timeout") {
        await removeContainer(name, {
          forceLog: true,
          logFile: logPaths.events,
          writer,
        });
      } else {
        await removeContainer(name, { forceLog: false });
      }

      const closeMsg = `CONTAINER_CLOSE name=${name} code=${result.code} reason=${result.reason || "exit"}`;
      fileLogService.append(logPaths.events, closeMsg);
      await writer.log(closeMsg, {
        stream: "events",
        level: result.code === 0 ? "info" : "error",
        meta: { code: result.code, reason: result.reason },
      });
      fileLogService.writeMeta(logPaths.meta, {
        finishedAt: new Date().toISOString(),
        exitCode: result.code,
        reason: result.reason || "exit",
        killed: result.reason === "failsafe_timeout",
      });
      await writer.drain();
      resolve(result);
    };

    timer = setTimeout(() => {
      const msg = `FAILSAFE_TIMEOUT after ${failsafeMs}ms — killing ${name}`;
      fileLogService.append(logPaths.events, msg);
      writer.log(msg, { stream: "events", level: "error" });
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      removeContainer(name, {
        forceLog: true,
        logFile: logPaths.events,
        writer,
      }).finally(() => {
        finish({
          code: 124,
          logs,
          error: `failsafe timeout ${failsafeMs}ms`,
          reason: "failsafe_timeout",
        });
      });
    }, failsafeMs);

    child.stdout.on("data", (d) => {
      const text = d.toString();
      logs += text;
      fileLogService.append(logPaths.docker, text.replace(/\n$/, ""));
      writer.pushChunk(text, false);
      eventBus.emit("log", { container: name, chunk: text, runId });
    });
    child.stderr.on("data", (d) => {
      const text = d.toString();
      logs += text;
      fileLogService.append(logPaths.docker, text.replace(/\n$/, ""));
      writer.pushChunk(text, true);
      eventBus.emit("log", { container: name, chunk: text, runId });
    });
    child.on("close", (code) =>
      finish({ code: code ?? 1, logs, reason: "process_close" })
    );
    child.on("error", (err) =>
      finish({
        code: 1,
        logs: String(err),
        error: err.message,
        reason: "spawn_error",
      })
    );
  });
}

/** Runs one bot container with retries against the shared cached image. */
export class DockerContainerRunner {
  async runWithRetries({
    nameBase,
    env,
    label,
    runId,
    maxRetries,
    failsafeMs,
    tokenId,
    username,
  }) {
    const logPaths = fileLogService.pathsForRun(runId, label);
    const ctx = { tokenId, username, label };
    const writer = createRunLogWriter(runId, ctx);
    await runRepository.update(runId, { log_dir: logPaths.dir });
    await writer.log(`Run initialized logDir=${logPaths.dir}`, {
      stream: "events",
    });

    try {
      const ready = await ensureBotImage();
      await writer.log(
        ready.cached
          ? `Using cached image ${BOT_IMAGE} (no rebuild for this user)`
          : `Built image ${BOT_IMAGE} once — later users will reuse cache`,
        { stream: "events" }
      );
    } catch (err) {
      await writer.log(`Bot image ensure failed: ${err.message}`, {
        stream: "events",
        level: "error",
      });
      return {
        code: 1,
        logs: "",
        error: `image ensure failed: ${err.message}`,
        reason: "image_build_failed",
        attempt: 1,
        logDir: logPaths.dir,
        retries: 0,
      };
    }

    let last = null;
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      const name = attempt === 1 ? nameBase : `${nameBase}-r${attempt}`;
      const msg = `ATTEMPT ${attempt}/${maxRetries + 1} container=${name} image=${BOT_IMAGE}`;
      fileLogService.append(logPaths.events, msg);
      await writer.log(msg, { stream: "events" });
      fileLogService.writeMeta(logPaths.meta, {
        attempt,
        maxRetries,
        image: BOT_IMAGE,
      });
      eventBus.emit("run", { runId, status: "running", attempt, label });

      last = await runDockerOnce({
        name,
        env: { ...env },
        logPaths,
        failsafeMs,
        runId,
        writer,
      });
      if (last.code === 0) {
        await writer.log(`SUCCESS on attempt ${attempt}`, { stream: "events" });
        return { ...last, attempt, logDir: logPaths.dir, retries: attempt - 1 };
      }

      await writer.log(
        `FAIL attempt ${attempt}: code=${last.code} error=${last.error || ""}`,
        { stream: "events", level: "error" }
      );
      if (attempt <= maxRetries) {
        const backoff = Math.min(30000, 2000 * attempt);
        await writer.log(`RETRY in ${backoff}ms`, {
          stream: "events",
          level: "warn",
        });
        await runRepository.update(runId, {
          status: "running",
          phase: "retrying",
          last_event: `retry_${attempt}`,
          error: last.error || `exit ${last.code}`,
        });
        eventBus.emit("run", { runId, status: "retrying", attempt, label });
        await sleep(backoff);
      }
    }

    return {
      ...last,
      attempt: maxRetries + 1,
      logDir: logPaths.dir,
      retries: maxRetries,
    };
  }
}

export const dockerContainerRunner = new DockerContainerRunner();
