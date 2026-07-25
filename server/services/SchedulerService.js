import cron from "node-cron";
import { settingsRepository, tokenRepository } from "../db/index.js";
import { batchFireService } from "./BatchFireService.js";

function cronExprFromTime(time) {
  const [hh, mm] = String(time || "09:00").split(":");
  return `${Number(mm) || 0} ${Number(hh) || 9} * * *`;
}

/** Owns per-token daily schedules (SRP). */
export class SchedulerService {
  constructor({ fireService = batchFireService } = {}) {
    this.fireService = fireService;
    /** @type {Map<number, import('node-cron').ScheduledTask>} */
    this.tasks = new Map();
    this.lastTicks = new Map();
    this.cached = {
      armedCount: 0,
      jobs: [],
      defaultTimezone: "Asia/Kolkata",
    };
  }

  getState() {
    return {
      ...this.cached,
      jobs: this.cached.jobs.map((j) => ({
        ...j,
        lastTick: this.lastTicks.get(j.tokenId) || null,
      })),
    };
  }

  stopAll() {
    for (const task of this.tasks.values()) {
      try {
        task.stop();
      } catch {
        /* ignore */
      }
    }
    this.tasks.clear();
  }

  async reschedule() {
    this.stopAll();
    const settings = await settingsRepository.getAll();
    const defaultTimezone = settings.timezone || "Asia/Kolkata";
    const tokens = await tokenRepository.listScheduled();
    const jobs = [];

    for (const token of tokens) {
      const time = token.schedule_time || settings.schedule_time || "09:00";
      const timezone = token.schedule_timezone || defaultTimezone;
      const expr = cronExprFromTime(time);
      if (!cron.validate(expr)) {
        console.error(
          `[scheduler] invalid cron for token ${token.id} time=${time}`
        );
        continue;
      }

      const task = cron.schedule(
        expr,
        async () => {
          const at = new Date().toISOString();
          this.lastTicks.set(token.id, at);
          console.log(
            `[scheduler] fire token=${token.id} user=${token.username || token.label} at ${at}`
          );
          try {
            await this.fireService.fire({
              kind: "scheduled",
              tokenIds: [token.id],
            });
          } catch (err) {
            console.error(
              `[scheduler] fire failed token=${token.id}:`,
              err.message
            );
          }
        },
        { timezone }
      );

      this.tasks.set(token.id, task);
      jobs.push({
        tokenId: token.id,
        label: token.label,
        username: token.username,
        time,
        timezone,
        expression: expr,
        running: true,
      });
    }

    this.cached = {
      armedCount: jobs.length,
      jobs,
      defaultTimezone,
    };

    if (jobs.length) {
      console.log(
        `[scheduler] armed ${jobs.length} per-token job(s): ` +
          jobs
            .map((j) => `#${j.tokenId}@${j.time}/${j.timezone}`)
            .join(", ")
      );
    } else {
      console.log("[scheduler] no per-token schedules armed");
    }

    return this.getState();
  }
}

export const schedulerService = new SchedulerService();
