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
      `— Matik Control`,
    ].join("\n");

    const html = `
      <div style="font-family:system-ui,sans-serif;line-height:1.45;color:#111">
        <h2 style="margin:0 0 12px">Matik run succeeded</h2>
        <table style="border-collapse:collapse;font-size:14px">
          <tr><td style="padding:4px 12px 4px 0;color:#555">Run ID</td><td><code>${runId}</code></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#555">User</td><td>${userLabel}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#555">Label</td><td>${label}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#555">Trigger</td><td>${kind}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#555">Answers</td><td>${answered}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#555">Streak</td><td>${streakBefore ?? "—"} → ${streakAfter ?? "—"} (${formatDelta(streakDelta)})</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#555">Started</td><td>${started}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#555">Finished</td><td>${finished}</td></tr>
        </table>
      </div>
    `.trim();

    return { subject, text, html, userLabel, runId };
  }
}

export { looksLikeEmail };
export const runSuccessMailBuilder = new RunSuccessMailBuilder();
