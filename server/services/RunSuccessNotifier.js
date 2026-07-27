import { runRepository, logRepository } from "../db/index.js";
import { mailService } from "./MailService.js";

export class RunSuccessNotifier {
  constructor({
    mail = mailService,
    runs = runRepository,
    logs = logRepository,
  } = {}) {
    this.mail = mail;
    this.runs = runs;
    this.logs = logs;
  }

  async #log(runId, message, extra = {}) {
    try {
      await this.logs.append({
        runId,
        message,
        stream: extra.stream || "mail",
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

  async notify({ runId, token, kind }) {
    try {
      const run = await this.runs.get(runId);
      const result = await this.mail.sendRunSuccess({
        to: token.email,
        run,
        token,
        kind,
      });
      const base = {
        tokenId: token.id,
        username: token.username,
        label: token.label,
      };
      if (result?.skipped) {
        await this.#log(runId, `Success email skipped (${result.reason})`, base);
        return result;
      }
      if (result?.ok) {
        await this.#log(runId, `Success email sent to ${result.to}`, {
          ...base,
          meta: { messageId: result.messageId },
        });
        return result;
      }
      await this.#log(
        runId,
        `Success email failed: ${result?.error || "unknown"}`,
        { ...base, level: "error" }
      );
      return result;
    } catch (err) {
      console.error("[mail] notify failed:", err.message);
      return { ok: false, error: err.message };
    }
  }
}

export const runSuccessNotifier = new RunSuccessNotifier();
