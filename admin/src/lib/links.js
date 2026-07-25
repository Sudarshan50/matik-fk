/** Build a logs deep-link without empty query params. */
export function logsHref({ tab, userId, runId } = {}) {
  const params = new URLSearchParams();
  if (tab === "runs") params.set("tab", "runs");
  if (userId) params.set("user", String(userId));
  if (runId) params.set("run", runId);
  const q = params.toString();
  return q ? `#/logs?${q}` : "#/logs";
}
