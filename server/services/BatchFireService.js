import { randomUUID } from "node:crypto";
import {
  settingsRepository,
  tokenRepository,
  runRepository,
  batchRepository,
  logRepository,
} from "../db/index.js";
import { eventBus } from "../shared/EventBus.js";
import { loadServerConfig } from "../config.js";
import { dockerContainerRunner } from "./DockerContainerRunner.js";
import { runSuccessNotifier } from "./RunSuccessNotifier.js";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function dbLog(runId, message, extra = {}) {
  try {
    await logRepository.append({
      runId,
      message,
      stream: extra.stream || "events",
      level: extra.level || "info",
      tokenId: extra.tokenId ?? null,
      username: extra.username ?? null,
      label: extra.label ?? null,
      meta: extra.meta ?? null,
    });
  } catch {
    /* ignore */
  }
}

export class BatchFireService {
  constructor({
    runner = dockerContainerRunner,
    successNotifier = runSuccessNotifier,
  } = {}) {
    this.runner = runner;
    this.successNotifier = successNotifier;
  }

  async fire({
    kind = "manual",
    tokenIds = null,
    maxParallel = null,
    staggerSeconds = null,
  } = {}) {
    const settings = await settingsRepository.getAll();
    const config = loadServerConfig();
    const parallel = Number(maxParallel ?? settings.max_parallel ?? 2);
    const stagger =
      Number(staggerSeconds ?? settings.stagger_seconds ?? 15) * 1000;
    const loops = settings.match_loops || "1";
    const searchUrl = settings.search_url || "";
    const maxRetries = Number(settings.max_retries ?? 2);
    const failsafeMs = Number(settings.failsafe_timeout_min ?? 8) * 60 * 1000;
    let answerCapMin = Number(settings.answer_cap_min ?? 20);
    let answerCapMax = Number(settings.answer_cap_max ?? 40);
    if (!Number.isFinite(answerCapMin) || answerCapMin < 1) answerCapMin = 20;
    if (!Number.isFinite(answerCapMax) || answerCapMax < 1) answerCapMax = 40;
    if (answerCapMin > answerCapMax) {
      [answerCapMin, answerCapMax] = [answerCapMax, answerCapMin];
    }

    let tokens = (await tokenRepository.list({ includeSecret: true })).filter(
      (t) => t.enabled
    );
    if (tokenIds?.length) {
      const set = new Set(tokenIds.map(Number));
      tokens = tokens.filter((t) => set.has(t.id));
    }
    if (!tokens.length) throw new Error("No enabled tokens to fire");

    const batchId = randomUUID();
    await batchRepository.create({
      id: batchId,
      kind,
      maxParallel: parallel,
      total: tokens.length,
    });
    eventBus.emit("batch", {
      batchId,
      status: "running",
      total: tokens.length,
      parallel,
    });

    const queue = [...tokens];
    let active = 0;
    let completed = 0;

    await new Promise((resolve) => {
      const pump = async () => {
        while (active < parallel && queue.length) {
          const token = queue.shift();
          active += 1;
          const runId = randomUUID();
          const container = `matik-bot-${token.id}-${runId.slice(0, 8)}`;
          await runRepository.create({
            id: runId,
            batch_id: batchId,
            token_id: token.id,
            label: token.label,
            username: token.username,
            container_name: container,
            status: "starting",
            phase: "starting",
          });
          await dbLog(
            runId,
            `Queued/starting for user=${token.username || token.label} tokenId=${token.id}`,
            {
              tokenId: token.id,
              username: token.username,
              label: token.label,
            }
          );
          eventBus.emit("run", {
            runId,
            status: "starting",
            label: token.label,
          });

          if (completed + active > 1 && stagger > 0) await sleep(stagger);

          await runRepository.update(runId, {
            status: "running",
            phase: "running",
            last_event: "docker_start",
          });

          this.runner
            .runWithRetries({
              nameBase: container,
              label: token.username || token.label,
              runId,
              maxRetries,
              failsafeMs,
              tokenId: token.id,
              username: token.username,
              env: {
                REFRESH_TOKEN: token.refresh_token,
                BOT_LABEL: token.label,
                MATCH_LOOPS: String(loops),
                SEARCH_URL: searchUrl,
                RUN_ID: runId,
                TOKEN_ID: String(token.id),
                ADMIN_API_URL: config.adminPublicUrl,
                ADMIN_BOT_TOKEN: config.auth.botToken,
                MATIKS_DEVICE_ID: `bot_${token.id}_${runId.slice(0, 6)}`,
                BOT_MAX_RETRIES: String(maxRetries),
                BOT_MAX_ANSWERS_MIN: String(answerCapMin),
                BOT_MAX_ANSWERS_MAX: String(answerCapMax),
              },
            })
            .then(async ({ code, logs, error, attempt, logDir, retries }) => {
              const existing = await runRepository.get(runId);
              const alreadyDone = existing?.status === "completed";
              const status = alreadyDone
                ? "completed"
                : code === 0
                  ? "completed"
                  : "failed";
              await runRepository.update(runId, {
                status,
                phase: status,
                finished_at: new Date().toISOString(),
                error: alreadyDone
                  ? existing.error
                  : error ||
                    (code === 0
                      ? null
                      : `exit ${code} after ${retries} retries`),
                last_event: status,
                container_name: container,
                log_dir: logDir,
              });
              await dbLog(
                runId,
                `Run finished status=${status} exit=${code} attempts=${attempt}`,
                {
                  tokenId: token.id,
                  username: token.username,
                  label: token.label,
                  level: status === "completed" ? "info" : "error",
                }
              );
              if (status === "completed") {
                await this.successNotifier.notify({ runId, token, kind });
              } else if (status === "failed") {
                await this.successNotifier.notifyFailure({
                  runId,
                  token,
                  kind,
                  logExcerpt: logs || error || "",
                });
              }
              eventBus.emit("run", {
                runId,
                status,
                exitCode: code,
                attempt,
                retries,
                logDir,
                logsTail: (logs || "").slice(-800),
              });
              active -= 1;
              completed += 1;
              if (!queue.length && active === 0) {
                await batchRepository.finish(batchId, "completed");
                eventBus.emit("batch", {
                  batchId,
                  status: "completed",
                  completed,
                });
                resolve();
              } else {
                pump();
              }
            });
        }

        if (!queue.length && active === 0) {
          batchRepository.finish(batchId, "completed").then(() => {
            eventBus.emit("batch", { batchId, status: "completed", completed });
            resolve();
          });
        }
      };
      pump();
    });

    return { batchId, total: tokens.length, parallel, maxRetries, failsafeMs };
  }
}

export const batchFireService = new BatchFireService();

/** Back-compat alias used by older imports. */
export function fireBatch(opts) {
  return batchFireService.fire(opts);
}

export function subscribe(fn) {
  return eventBus.subscribe(fn);
}
