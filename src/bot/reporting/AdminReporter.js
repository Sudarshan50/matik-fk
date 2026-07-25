/** Reports bot lifecycle events to the admin API (optional). */
export class AdminReporter {
  constructor({
    adminUrl = process.env.ADMIN_API_URL || "",
    runId = process.env.RUN_ID || "",
    tokenId = process.env.TOKEN_ID || "",
    botToken = process.env.ADMIN_BOT_TOKEN || "",
  } = {}) {
    this.adminUrl = String(adminUrl).replace(/\/$/, "");
    this.runId = runId;
    this.tokenId = tokenId;
    this.botToken = botToken;
  }

  enabled() {
    return Boolean(this.adminUrl && this.runId && this.botToken);
  }

  async report(event, payload = {}) {
    if (!this.enabled()) return;
    try {
      await fetch(`${this.adminUrl}/api/runs/${this.runId}/events`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.botToken}`,
        },
        body: JSON.stringify({
          tokenId: this.tokenId,
          event,
          at: new Date().toISOString(),
          ...payload,
        }),
      });
    } catch (err) {
      console.log(`[report] failed ${event}:`, err.message);
    }
  }

  heartbeat(payload = {}) {
    return this.report("heartbeat", payload);
  }
}
