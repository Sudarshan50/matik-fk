export function formatDelta(delta) {
  if (delta == null) return "—";
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

export function deltaClass(delta) {
  if (delta == null) return "delta-flat";
  if (delta > 0) return "delta-up";
  if (delta < 0) return "delta-down";
  return "delta-flat";
}

export function levelClass(level) {
  if (level === "error") return "log-error";
  if (level === "warn") return "log-warn";
  return "";
}
