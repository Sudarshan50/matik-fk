function looksLikeEmail(value) {
  const s = String(value || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function formatDelta(delta) {
  if (delta == null || Number.isNaN(Number(delta))) return "—";
  const n = Number(delta);
  return n > 0 ? `+${n}` : String(n);
}

function formatInIst(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Keep a short, secret-safe log excerpt for failure mails. */
function briefLogExcerpt(raw, { maxLines = 18, maxChars = 1800 } = {}) {
  const text = String(raw || "")
    .replace(/refresh[_-]?token["'\s:=]+[^\s"'&,}]+/gi, "refresh_token=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]")
    .trim();
  if (!text) return "(no log excerpt)";
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const slice = lines.slice(-maxLines).join("\n");
  if (slice.length <= maxChars) return slice;
  return `…\n${slice.slice(-maxChars)}`;
}

export class RunSuccessMailBuilder {
  build({ run, token, kind = "manual" } = {}) {
    const userLabel =
      run?.username || token?.username || token?.label || "user";
    const runId = run?.id || "?";
    const answered = run?.answered ?? 0;
    const streakBefore = run?.streak_before;
    const streakAfter = run?.streak_after;
    const streakDelta = run?.streak_delta;
    const label = token?.label || run?.label || "—";
    const started = formatInIst(run?.started_at);
    const finished = formatInIst(run?.finished_at);

    const subject = `[Matik] Run succeeded · ${userLabel} · ${String(runId).slice(0, 8)}`;
    const text = [
      `Matik automation run succeeded.`,
      ``,
      `Run ID: ${runId}`,
      `User: ${userLabel}`,
      `Label: ${label}`,
      `Trigger: ${kind}`,
      `Status: ${run?.status || "completed"}`,
      `Answers: ${answered}`,
      `Streak before: ${streakBefore ?? "—"}`,
      `Streak after: ${streakAfter ?? "—"}`,
      `Streak Δ: ${formatDelta(streakDelta)}`,
      `Started: ${started}`,
      `Finished: ${finished}`,
      ``,
      `This is a system-generated email. Please do not reply.`,
      `— Matik Control`,
    ].join("\n");

    const html = `
      <div style="font-family:system-ui,sans-serif;line-height:1.45;color:#111">
        <h2 style="margin:0 0 12px">Matik run succeeded</h2>
        <table style="border-collapse:collapse;font-size:14px">
          <tr><td style="padding:4px 12px 4px 0;color:#555">Run ID</td><td><code>${escapeHtml(runId)}</code></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#555">User</td><td>${escapeHtml(userLabel)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#555">Label</td><td>${escapeHtml(label)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#555">Trigger</td><td>${escapeHtml(kind)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#555">Answers</td><td>${answered}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#555">Streak</td><td>${streakBefore ?? "—"} → ${streakAfter ?? "—"} (${formatDelta(streakDelta)})</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#555">Started</td><td>${escapeHtml(started)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#555">Finished</td><td>${escapeHtml(finished)}</td></tr>
        </table>
        <p style="margin:16px 0 0;font-size:12px;color:#666">This is a system-generated email. Please do not reply.</p>
      </div>
    `.trim();

    return { subject, text, html, userLabel, runId };
  }

  buildFailure({ run, token, kind = "manual", logExcerpt = "" } = {}) {
    const userLabel =
      run?.username || token?.username || token?.label || "user";
    const runId = run?.id || "?";
    const label = token?.label || run?.label || "—";
    const started = formatInIst(run?.started_at);
    const finished = formatInIst(run?.finished_at);
    const error = run?.error || "unknown error";
    const logs = briefLogExcerpt(logExcerpt);

    const subject = `[Matik] Run FAILED · ${userLabel} · ${String(runId).slice(0, 8)}`;
    const text = [
      `Matik automation run failed.`,
      ``,
      `Run ID: ${runId}`,
      `User: ${userLabel}`,
      `Label: ${label}`,
      `Trigger: ${kind}`,
      `Status: ${run?.status || "failed"}`,
      `Error: ${error}`,
      `Answers: ${run?.answered ?? 0}`,
      `Started: ${started}`,
      `Finished: ${finished}`,
      ``,
      `Brief logs:`,
      logs,
      ``,
      `This is a system-generated email. Please do not reply.`,
      `— Matik Control`,
    ].join("\n");

    const html = `
      <div style="font-family:system-ui,sans-serif;line-height:1.45;color:#111">
        <h2 style="margin:0 0 12px;color:#b42318">Matik run failed</h2>
        <table style="border-collapse:collapse;font-size:14px">
          <tr><td style="padding:4px 12px 4px 0;color:#555">Run ID</td><td><code>${escapeHtml(runId)}</code></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#555">User</td><td>${escapeHtml(userLabel)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#555">Label</td><td>${escapeHtml(label)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#555">Trigger</td><td>${escapeHtml(kind)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#555">Error</td><td>${escapeHtml(error)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#555">Answers</td><td>${run?.answered ?? 0}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#555">Started</td><td>${escapeHtml(started)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#555">Finished</td><td>${escapeHtml(finished)}</td></tr>
        </table>
        <h3 style="margin:16px 0 8px;font-size:14px">Brief logs</h3>
        <pre style="margin:0;padding:10px 12px;background:#f6f6f6;border-radius:6px;font-size:12px;white-space:pre-wrap;word-break:break-word">${escapeHtml(logs)}</pre>
        <p style="margin:16px 0 0;font-size:12px;color:#666">This is a system-generated email. Please do not reply.</p>
      </div>
    `.trim();

    return { subject, text, html, userLabel, runId };
  }
}

export { looksLikeEmail };
export const runSuccessMailBuilder = new RunSuccessMailBuilder();
