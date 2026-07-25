import {
  runRepository,
  tokenRepository,
  streakRepository,
  logRepository,
} from "../db/index.js";
import { eventBus } from "../shared/EventBus.js";
import { sanitizeEventBody } from "../security/redact.js";

function summarizeEvent(event, body) {
  switch (event) {
    case "started":
      return `bot started label=${body.label || "?"}`;
    case "streak_before":
      return `streak before=${body.streak?.currentStreak} user=${body.user?.username}`;
    case "streak_after":
      return `streak ${body.previousStreak} → ${body.currentStreak} (Δ ${body.delta})`;
    case "home_ready":
      return `home ready @${body.username || ""}`;
    case "match_attempt":
      return `match loop=${body.loop} attempt=${body.attempt}`;
    case "match_result":
      return `match ${body.result?.status} answered=${body.result?.answered} url=${body.result?.url || ""}`;
    case "heartbeat":
      return `heartbeat phase=${body.phase} answered=${body.answered ?? 0}`;
    case "completed":
      return `completed answered=${body.answered} streak ${body.previousStreak}→${body.currentStreak}`;
    case "refresh_rotated":
      return `refresh token rotated${
        body.refreshTokenHint ? ` (${body.refreshTokenHint})` : ""
      }`;
    case "failed":
    case "error":
      return body.message || "error";
    default:
      return JSON.stringify(sanitizeEventBody(body)).slice(0, 240);
  }
}

/** Applies bot-reported events to DB runs/streaks (SRP). */
export class RunEventService {
  async handle(runId, body = {}) {
    const run = await runRepository.get(runId);
    if (!run) return { error: "run not found", status: 404 };

    const event = body.event || "event";

    // Persist rotated refresh tokens before redacting for logs/SSE.
    if (event === "refresh_rotated" && body.refreshToken && run.token_id) {
      await tokenRepository.update(run.token_id, {
        refreshToken: body.refreshToken,
      });
    }

    const safeBody = sanitizeEventBody(body);
    await runRepository.addEvent(runId, event, safeBody);
    await logRepository.append({
      runId,
      tokenId: run.token_id,
      username: run.username || body.username || body.user?.username,
      label: run.label,
      stream: "bot",
      level: event === "failed" || event === "error" ? "error" : "info",
      message: `[${event}] ${summarizeEvent(event, safeBody)}`,
      meta: safeBody,
    });

    const patch = {
      last_event: event,
      phase: body.phase || run.phase,
      status: run.status === "starting" ? "running" : run.status,
    };

    if (event === "streak_before" && body.streak) {
      patch.streak_before = body.streak.currentStreak;
      if (body.user?.username) patch.username = body.user.username;
      if (run.token_id) {
        await tokenRepository.recordStreak(run.token_id, {
          username: body.user?.username,
          previous: body.streak.currentStreak,
          current: body.streak.currentStreak,
          longest: body.streak.longestStreak,
          status: body.streak.currentStreakStatus,
        });
      }
    }
    if (event === "streak_after") {
      patch.streak_after = body.currentStreak;
      patch.streak_before = body.previousStreak ?? run.streak_before;
      patch.streak_delta = body.delta;
      if (run.token_id) {
        await tokenRepository.recordStreak(run.token_id, {
          username: body.user?.username || run.username,
          previous: body.previousStreak ?? run.streak_before,
          current: body.currentStreak,
          longest: body.streakAfter?.longestStreak,
          status: body.streakAfter?.currentStreakStatus,
          fromRun: true,
        });
      }
    }
    if (event === "match_result" && body.result?.answered != null) {
      patch.answered = (run.answered || 0) + (body.result.answered || 0);
    }
    if (event === "heartbeat" && body.answered != null) {
      patch.answered = body.answered;
      patch.phase = body.phase || run.phase;
    }
    if (event === "completed") {
      patch.status = "completed";
      patch.phase = "completed";
      patch.finished_at = new Date().toISOString();
      if (body.answered != null) patch.answered = body.answered;
      if (body.currentStreak != null) patch.streak_after = body.currentStreak;
      if (body.previousStreak != null) patch.streak_before = body.previousStreak;
      if (body.delta != null) patch.streak_delta = body.delta;
      if (body.username) patch.username = body.username;
      if (run.token_id && body.currentStreak != null) {
        await tokenRepository.recordStreak(run.token_id, {
          username: body.username || run.username,
          previous: body.previousStreak,
          current: body.currentStreak,
          longest: body.streakAfter?.longestStreak,
          status: body.streakAfter?.currentStreakStatus,
          fromRun: true,
        });
      }
      await streakRepository.addLog({
        token_id: run.token_id,
        run_id: runId,
        username: body.username || run.username,
        label: run.label,
        streak_before: body.previousStreak ?? run.streak_before,
        streak_after: body.currentStreak ?? run.streak_after,
        streak_delta: body.delta ?? run.streak_delta,
        streak_longest: body.streakAfter?.longestStreak ?? null,
        answered: body.answered ?? run.answered,
        status: "completed",
        source: "run_completed",
      });
    }
    if (event === "failed") {
      patch.status = "failed";
      patch.phase = "failed";
      patch.error = body.message || "failed";
      patch.finished_at = new Date().toISOString();
    }
    const updated = await runRepository.update(runId, patch);
    eventBus.emit("run_event", {
      runId,
      event,
      run: updated,
      body: safeBody,
    });
    return { ok: true, run: updated };
  }

  async getDetail(runId) {
    const run = await runRepository.get(runId);
    if (!run) return null;
    const [events, logs, streakLogs] = await Promise.all([
      runRepository.listEvents(runId, 500),
      logRepository.list(runId, { limit: 8000 }),
      streakRepository.forRun(runId),
    ]);
    return { run, events, logs, streakLogs };
  }
}

export const runEventService = new RunEventService();
