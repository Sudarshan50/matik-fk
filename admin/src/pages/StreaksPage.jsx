import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client.js";
import { formatDelta, deltaClass } from "../lib/format.js";
import { logsHref } from "../lib/links.js";
import { useLiveStream } from "../hooks/useLiveStream.js";
import { useHashRoute } from "../hooks/useHashRoute.js";
import Nav from "../components/Nav.jsx";
import PageHeader from "../components/PageHeader.jsx";
import StatStrip from "../components/StatStrip.jsx";
import EmptyState from "../components/EmptyState.jsx";
import StreakBoardTable from "../components/StreakBoardTable.jsx";
import ListRow from "../components/ListRow.jsx";

export default function StreaksPage() {
  const { query } = useHashRoute();
  const [board, setBoard] = useState([]);
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState(() => query.get("user") || "all");
  const [historyQuery, setHistoryQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const user = query.get("user");
    if (user) setFilter(user);
  }, [query]);

  const refresh = useCallback(async () => {
    const [st, hist] = await Promise.all([
      api("/api/streaks"),
      api("/api/streaks/history"),
    ]);
    setBoard(st.users || []);
    setUsers(hist.users || []);
  }, []);

  const onLive = useCallback(
    (evt) => {
      if (
        evt.type === "run" ||
        evt.type === "run_event" ||
        evt.type === "batch" ||
        evt.type === "streaks"
      ) {
        refresh().catch(() => {});
      }
    },
    [refresh]
  );
  const live = useLiveStream(onLive);

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    const t = setInterval(() => refresh().catch(() => {}), 10000);
    return () => clearInterval(t);
  }, [refresh]);

  async function refreshStreaks() {
    setBusy(true);
    setError("");
    try {
      await api("/api/streaks/refresh", {
        method: "POST",
        body: JSON.stringify({}),
      });
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const stats = useMemo(() => {
    const withData = board.filter((u) => u.streakCurrent != null);
    return [
      { label: "Users", value: board.length },
      {
        label: "Up",
        value: board.filter((u) => (u.streakDelta || 0) > 0).length,
      },
      {
        label: "Down",
        value: board.filter((u) => (u.streakDelta || 0) < 0).length,
      },
      {
        label: "Avg streak",
        value: withData.length
          ? Math.round(
              withData.reduce((s, u) => s + (u.streakCurrent || 0), 0) /
                withData.length
            )
          : "—",
      },
    ];
  }, [board]);

  const visible = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (filter !== "all" && String(u.tokenId) !== filter) return false;
      if (!q) return true;
      const hay = [u.username, u.label, String(u.tokenId)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [users, filter, historyQuery]);

  return (
    <div className="shell">
      <Nav live={live} />

      <PageHeader
        title="Streaks"
        subtitle="Scan every account’s streak, then drill into history."
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => refresh()}>
              Reload
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={refreshStreaks}
            >
              {busy ? "Refreshing…" : "Refresh all"}
            </button>
          </>
        }
      />

      {error ? (
        <div className="banner banner-error">
          <span>{error}</span>
          <button type="button" className="btn btn-ghost" onClick={() => setError("")}>
            Dismiss
          </button>
        </div>
      ) : null}

      <StatStrip items={stats} />

      <StreakBoardTable board={board} />

      <section className="card streak-history-panel">
        <div className="card-head token-panel-head">
          <div>
            <h2>History</h2>
            <p className="card-note card-note-inline">
              Per-user streak changes from completed runs.
            </p>
          </div>
        </div>

        <div className="token-toolbar">
          <input
            className="token-search"
            type="search"
            placeholder="Search history users…"
            value={historyQuery}
            onChange={(e) => setHistoryQuery(e.target.value)}
          />
          <label className="inline-field">
            User
            <select
              value={filter}
              onChange={(e) => {
                const value = e.target.value;
                setFilter(value);
                location.hash =
                  value === "all" ? "#/streaks" : `#/streaks?user=${value}`;
              }}
            >
              <option value="all">All users</option>
              {board.map((u) => (
                <option key={u.id} value={String(u.id)}>
                  {u.username || u.label || `user #${u.id}`}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="history-stack">
          {visible.length === 0 ? (
            <EmptyState
              title="No history yet"
              hint="Complete a run to populate streak logs."
            />
          ) : (
            visible.map((u) => (
              <article className="history-card" key={u.tokenId}>
                <div className="history-card-head">
                  <div>
                    <h3>{u.username || u.label || `user #${u.tokenId}`}</h3>
                    <p className="subtle">
                      current {u.current ?? "—"} · previous {u.previous ?? "—"} ·{" "}
                      <span className={deltaClass(u.delta)}>{formatDelta(u.delta)}</span>
                      {(u.logs || []).length
                        ? ` · ${u.logs.length} event${u.logs.length === 1 ? "" : "s"}`
                        : ""}
                    </p>
                  </div>
                  <a
                    className="btn btn-ghost btn-sm"
                    href={logsHref({ userId: u.tokenId })}
                  >
                    All runs →
                  </a>
                </div>

                <div className="history-list">
                  {(u.logs || []).length === 0 ? (
                    <EmptyState title="No streak rows" />
                  ) : (
                    u.logs.map((log) => (
                      <ListRow
                        key={log.id}
                        as="a"
                        href={
                          log.run_id
                            ? logsHref({ tab: "runs", runId: log.run_id })
                            : logsHref({ userId: u.tokenId })
                        }
                        title={
                          String(log.run_id || "").slice(0, 8) || `#${log.id}`
                        }
                        status={log.status || "completed"}
                        meta={`${new Date(log.created_at).toLocaleString()}${
                          log.answered != null ? ` · answers ${log.answered}` : ""
                        }`}
                        trailing={
                          <div className="delta-pill">
                            <span>{log.streak_before ?? "—"}</span>
                            <span className="arrow">→</span>
                            <span>{log.streak_after ?? "—"}</span>
                            <span className={deltaClass(log.streak_delta)}>
                              {formatDelta(log.streak_delta)}
                            </span>
                          </div>
                        }
                      />
                    ))
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
