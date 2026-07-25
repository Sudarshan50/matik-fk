import { useHashRoute } from "../hooks/useHashRoute.js";
import { formatServerClock, useServerTime } from "../hooks/useServerTime.js";
import { useAuth } from "../auth/AuthContext.jsx";

const LINKS = [
  { href: "#/", path: "/", label: "Control" },
  { href: "#/streaks", path: "/streaks", label: "Streaks" },
  { href: "#/logs", path: "/logs", label: "Logs" },
];

export default function Nav({ live = false }) {
  const { path } = useHashRoute();
  const { now, timezone, synced } = useServerTime();
  const { user, logout } = useAuth();

  return (
    <header className="topnav">
      <div className="topnav-brand">
        <span className="brand-mark">M</span>
        <div>
          <div className="brand-name">Matik</div>
          <div className="brand-sub">Admin</div>
        </div>
      </div>

      <nav className="topnav-links" aria-label="Primary">
        {LINKS.map((link) => {
          const active =
            link.path === "/"
              ? path === "/" || path === ""
              : path === link.path || path.startsWith(`${link.path}/`);
          return (
            <a
              key={link.path}
              href={link.href}
              className={`topnav-link ${active ? "is-active" : ""}`}
            >
              {link.label}
            </a>
          );
        })}
      </nav>

      <div
        className={`topnav-clock ${synced ? "is-synced" : ""}`}
        title={synced ? `Server time (${timezone})` : "Using local clock (server sync failed)"}
      >
        <span className="clock-label">Server</span>
        <span className="clock-value mono">{formatServerClock(now, timezone)}</span>
        {timezone ? <span className="clock-tz">{timezone}</span> : null}
      </div>

      <div className={`topnav-live ${live ? "is-on" : ""}`}>
        <span className="live-dot" />
        {live ? "Live" : "Offline"}
      </div>

      <div className="topnav-user">
        <span className="user-name" title={user?.username || ""}>
          {user?.username || "—"}
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => logout()}>
          Log out
        </button>
      </div>
    </header>
  );
}
