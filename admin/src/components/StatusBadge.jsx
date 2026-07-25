export default function StatusBadge({ status, children }) {
  const key = String(status || "idle").toLowerCase();
  return <span className={`badge badge-${key}`}>{children || status || "idle"}</span>;
}
