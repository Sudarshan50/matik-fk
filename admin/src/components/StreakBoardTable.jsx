import { useMemo, useState } from "react";
import { formatDelta, deltaClass } from "../lib/format.js";
import { logsHref } from "../lib/links.js";
import StatusBadge from "./StatusBadge.jsx";
import EmptyState from "./EmptyState.jsx";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "up", label: "Up" },
  { id: "down", label: "Down" },
  { id: "flat", label: "Flat" },
  { id: "enabled", label: "Enabled" },
  { id: "disabled", label: "Disabled" },
  { id: "unknown", label: "No data" },
];

function sortValue(u, key) {
  switch (key) {
    case "current":
      return u.streakCurrent ?? -1;
    case "delta":
      return u.streakDelta ?? 0;
    case "longest":
      return u.streakLongest ?? -1;
    case "checked":
      return u.streakCheckedAt ? new Date(u.streakCheckedAt).getTime() : 0;
    case "name":
    default:
      return String(u.username || u.label || "").toLowerCase();
  }
}

export default function StreakBoardTable({ board }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sortKey, setSortKey] = useState("current");
  const [sortDir, setSortDir] = useState("desc");

  const counts = useMemo(() => {
    const up = board.filter((u) => (u.streakDelta || 0) > 0).length;
    const down = board.filter((u) => (u.streakDelta || 0) < 0).length;
    const flat = board.filter(
      (u) => u.streakCurrent != null && (u.streakDelta || 0) === 0
    ).length;
    const enabled = board.filter((u) => u.enabled).length;
    const disabled = board.filter((u) => !u.enabled).length;
    const unknown = board.filter((u) => u.streakCurrent == null).length;
    return {
      all: board.length,
      up,
      down,
      flat,
      enabled,
      disabled,
      unknown,
    };
  }, [board]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = board.filter((u) => {
      if (filter === "up" && !((u.streakDelta || 0) > 0)) return false;
      if (filter === "down" && !((u.streakDelta || 0) < 0)) return false;
      if (
        filter === "flat" &&
        !(u.streakCurrent != null && (u.streakDelta || 0) === 0)
      )
        return false;
      if (filter === "enabled" && !u.enabled) return false;
      if (filter === "disabled" && u.enabled) return false;
      if (filter === "unknown" && u.streakCurrent != null) return false;
      if (!q) return true;
      const hay = [u.username, u.label, String(u.id), u.streakStatus]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    const dir = sortDir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (typeof av === "string" && typeof bv === "string") {
        return av.localeCompare(bv) * dir;
      }
      return (av - bv) * dir;
    });
  }, [board, query, filter, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  function sortMark(key) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  return (
    <section className="card streak-panel">
      <div className="card-head token-panel-head">
        <div>
          <h2>Current streaks</h2>
          <p className="card-note card-note-inline">
            {board.length} user{board.length === 1 ? "" : "s"} · {counts.up} up ·{" "}
            {counts.down} down · {counts.unknown} unchecked
          </p>
        </div>
      </div>

      <div className="token-toolbar">
        <input
          className="token-search"
          type="search"
          placeholder="Search user or label…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="token-filters" role="tablist" aria-label="Filter streaks">
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

      {rows.length === 0 ? (
        <EmptyState
          title={board.length ? "No matches" : "No streak data"}
          hint={
            board.length
              ? "Try another filter or search."
              : "Add tokens on Control, then hit Refresh all."
          }
        />
      ) : (
        <div className="token-table-wrap">
          <table className="token-table streak-table">
            <thead>
              <tr>
                <th>
                  <button
                    type="button"
                    className="th-sort"
                    onClick={() => toggleSort("name")}
                  >
                    User{sortMark("name")}
                  </button>
                </th>
                <th>Status</th>
                <th>
                  <button
                    type="button"
                    className="th-sort"
                    onClick={() => toggleSort("current")}
                  >
                    Current{sortMark("current")}
                  </button>
                </th>
                <th>Previous</th>
                <th>
                  <button
                    type="button"
                    className="th-sort"
                    onClick={() => toggleSort("delta")}
                  >
                    Δ{sortMark("delta")}
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="th-sort"
                    onClick={() => toggleSort("longest")}
                  >
                    Longest{sortMark("longest")}
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="th-sort"
                    onClick={() => toggleSort("checked")}
                  >
                    Checked{sortMark("checked")}
                  </button>
                </th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const name = u.username || u.label || `user #${u.id}`;
                return (
                  <tr
                    key={u.id}
                    className={[
                      u.enabled ? "" : "is-disabled",
                      (u.streakDelta || 0) > 0 ? "is-up" : "",
                      (u.streakDelta || 0) < 0 ? "is-down" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <td className="col-user">
                      <div className="token-name">{name}</div>
                      <div className="subtle mono">
                        #{u.id}
                        {u.label && u.username ? ` · ${u.label}` : ""}
                      </div>
                    </td>
                    <td>
                      <div className="token-badges">
                        <StatusBadge status={u.streakStatus || "idle"}>
                          {u.streakStatus || "idle"}
                        </StatusBadge>
                        {!u.enabled ? (
                          <StatusBadge status="off">off</StatusBadge>
                        ) : null}
                      </div>
                    </td>
                    <td className="col-num">
                      <strong className="streak-num">
                        {u.streakCurrent == null ? "—" : u.streakCurrent}
                      </strong>
                    </td>
                    <td className="col-num">
                      {u.streakPrevious == null ? "—" : u.streakPrevious}
                    </td>
                    <td className="col-num">
                      <span className={deltaClass(u.streakDelta)}>
                        {formatDelta(u.streakDelta)}
                      </span>
                    </td>
                    <td className="col-num">
                      {u.streakLongest == null ? "—" : u.streakLongest}
                    </td>
                    <td className="col-checked">
                      {u.streakCheckedAt
                        ? new Date(u.streakCheckedAt).toLocaleString()
                        : "—"}
                    </td>
                    <td className="col-actions">
                      <div className="token-row-actions">
                        <a
                          className="btn btn-ghost btn-sm"
                          href={logsHref({ userId: u.id })}
                        >
                          Logs
                        </a>
                        <a
                          className="btn btn-secondary btn-sm"
                          href={`#/streaks?user=${u.id}`}
                        >
                          History
                        </a>
                      </div>
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
