import { useMemo, useState } from "react";
import { logsHref } from "../lib/links.js";
import StatusBadge from "./StatusBadge.jsx";
import EmptyState from "./EmptyState.jsx";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "enabled", label: "Enabled" },
  { id: "scheduled", label: "Scheduled" },
  { id: "active", label: "Running" },
  { id: "disabled", label: "Disabled" },
];

function draftFor(token, drafts) {
  return (
    drafts[token.id] || {
      scheduleEnabled: Boolean(token.schedule_enabled),
      scheduleTime: token.schedule_time || "09:00",
      email: token.email || "",
    }
  );
}

export default function TokenScheduleTable({
  tokens,
  drafts,
  settings,
  activeIds,
  jobByToken,
  busy,
  onUpdateDraft,
  onSaveSchedule,
  onFire,
  onToggle,
  onRemove,
  scheduleDirty,
  newLabel,
  newToken,
  newEmail,
  onNewLabel,
  onNewToken,
  onNewEmail,
  onAdd,
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const counts = useMemo(() => {
    const enabled = tokens.filter((t) => t.enabled).length;
    const scheduled = tokens.filter((t) => t.enabled && t.schedule_enabled).length;
    const running = tokens.filter((t) => activeIds.has(t.id)).length;
    const disabled = tokens.filter((t) => !t.enabled).length;
    return {
      all: tokens.length,
      enabled,
      scheduled,
      active: running,
      disabled,
    };
  }, [tokens, activeIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tokens.filter((token) => {
      if (filter === "enabled" && !token.enabled) return false;
      if (filter === "disabled" && token.enabled) return false;
      if (filter === "scheduled" && !(token.enabled && token.schedule_enabled))
        return false;
      if (filter === "active" && !activeIds.has(token.id)) return false;
      if (!q) return true;
      const hay = [
        token.username,
        token.label,
        token.email,
        token.refresh_token_hint,
        String(token.id),
        token.schedule_time,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [tokens, filter, query, activeIds]);

  return (
    <section className="card token-panel">
      <div className="card-head token-panel-head">
        <div>
          <h2>Tokens & schedules</h2>
          <p className="card-note card-note-inline">
            {tokens.length} user{tokens.length === 1 ? "" : "s"} ·{" "}
            {counts.scheduled} scheduled · {counts.active} running
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setShowAdd((v) => !v)}
        >
          {showAdd ? "Close" : "Add token"}
        </button>
      </div>

      {showAdd ? (
        <div className="token-add">
          <input
            placeholder="Label (optional)"
            value={newLabel}
            onChange={(e) => onNewLabel(e.target.value)}
          />
          <input
            placeholder="Paste refresh token"
            value={newToken}
            onChange={(e) => onNewToken(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onAdd();
            }}
          />
          <input
            type="email"
            placeholder="Notify email (optional)"
            value={newEmail}
            onChange={(e) => onNewEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onAdd();
            }}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !newToken.trim()}
            onClick={onAdd}
          >
            Add
          </button>
        </div>
      ) : null}

      <div className="token-toolbar">
        <input
          className="token-search"
          type="search"
          placeholder="Search user, label, token…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="token-filters" role="tablist" aria-label="Filter tokens">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={`chip ${filter === f.id ? "is-active" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              <span className="chip-count">{counts[f.id] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={tokens.length ? "No matches" : "No tokens yet"}
          hint={
            tokens.length
              ? "Try another filter or search."
              : "Add a refresh token to get started."
          }
        />
      ) : (
        <div className="token-table-wrap">
          <table className="token-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Status</th>
                <th>Schedule</th>
                <th>Time</th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((token) => {
                const draft = draftFor(token, drafts);
                const job = jobByToken.get(token.id);
                const dirty = scheduleDirty(token);
                const expanded = expandedId === token.id;
                const name = token.username || token.label || `token-${token.id}`;
                return (
                  <tr
                    key={token.id}
                    className={[
                      activeIds.has(token.id) ? "is-active" : "",
                      token.enabled ? "" : "is-disabled",
                      dirty ? "is-dirty" : "",
                      expanded ? "is-expanded" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <td className="col-user">
                      <button
                        type="button"
                        className="token-user-btn"
                        onClick={() =>
                          setExpandedId(expanded ? null : token.id)
                        }
                        title="Show details"
                      >
                        <span className="token-name">{name}</span>
                        <span className="subtle mono">
                          #{token.id} · {token.refresh_token_hint || "••••"}
                        </span>
                      </button>
                    </td>
                    <td className="col-email">
                      <input
                        type="email"
                        className="input-compact"
                        placeholder="user@iitd.ac.in"
                        value={draft.email || ""}
                        disabled={busy}
                        onChange={(e) =>
                          onUpdateDraft(token.id, { email: e.target.value })
                        }
                      />
                    </td>
                    <td className="col-status">
                      <div className="token-badges">
                        {activeIds.has(token.id) ? (
                          <StatusBadge status="running">running</StatusBadge>
                        ) : null}
                        {token.schedule_enabled && token.enabled ? (
                          <StatusBadge status="ok">scheduled</StatusBadge>
                        ) : null}
                        {!token.enabled ? (
                          <StatusBadge status="off">off</StatusBadge>
                        ) : !token.schedule_enabled ? (
                          <StatusBadge status="idle">manual</StatusBadge>
                        ) : null}
                      </div>
                    </td>
                    <td className="col-sched">
                      <label className="check check-inline">
                        <input
                          type="checkbox"
                          checked={draft.scheduleEnabled}
                          disabled={!token.enabled || busy}
                          onChange={(e) =>
                            onUpdateDraft(token.id, {
                              scheduleEnabled: e.target.checked,
                            })
                          }
                        />
                        Daily
                      </label>
                    </td>
                    <td className="col-time">
                      <input
                        type="time"
                        className="input-compact"
                        value={draft.scheduleTime}
                        disabled={!token.enabled || busy}
                        onChange={(e) =>
                          onUpdateDraft(token.id, {
                            scheduleTime: e.target.value,
                          })
                        }
                      />
                      {job ? (
                        <div className="token-armed subtle">
                          Armed {job.time}
                          {job.lastTick
                            ? ` · last ${new Date(job.lastTick).toLocaleTimeString()}`
                            : ""}
                        </div>
                      ) : null}
                    </td>
                    <td className="col-actions">
                      <div className="token-row-actions">
                        {dirty ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={busy || !token.enabled}
                            onClick={() => onSaveSchedule(token)}
                          >
                            Save
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={
                            busy || !token.enabled || activeIds.has(token.id)
                          }
                          onClick={() => onFire([token.id])}
                        >
                          Fire
                        </button>
                        <a
                          className="btn btn-ghost btn-sm"
                          href={logsHref({ userId: token.id })}
                        >
                          Logs
                        </a>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => onToggle(token)}
                        >
                          {token.enabled ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => onRemove(token.id)}
                        >
                          Remove
                        </button>
                      </div>
                      {expanded ? (
                        <div className="token-row-detail">
                          <div>
                            <span className="subtle">Email</span>
                            <div>{token.email || "—"}</div>
                          </div>
                          <div>
                            <span className="subtle">Label</span>
                            <div>{token.label || "—"}</div>
                          </div>
                          <div>
                            <span className="subtle">Username</span>
                            <div>{token.username || "—"}</div>
                          </div>
                          <div>
                            <span className="subtle">Token</span>
                            <div className="mono break">
                              {token.refresh_token_hint || "••••"}
                            </div>
                          </div>
                          <div>
                            <span className="subtle">Last run</span>
                            <div>
                              {token.last_run_at
                                ? new Date(token.last_run_at).toLocaleString()
                                : "Never"}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
