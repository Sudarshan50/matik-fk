import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client.js";
import { formatDelta } from "../lib/format.js";
import { logsHref } from "../lib/links.js";
import { useLiveStream } from "../hooks/useLiveStream.js";
import { useHashRoute } from "../hooks/useHashRoute.js";
import Nav from "../components/Nav.jsx";
import PageHeader from "../components/PageHeader.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ListRow from "../components/ListRow.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import LogConsole from "../components/LogConsole.jsx";

function parseFromQuery(query) {
  const userRaw = query.get("user");
  const userId = userRaw && Number(userRaw) > 0 ? Number(userRaw) : null;
  const runId = query.get("run") || null;
  const tabParam = query.get("tab");
  const tab =
    tabParam === "runs" || tabParam === "users"
      ? tabParam
      : runId && !userId
        ? "runs"
        : "users";
  return { tab, userId, runId };
}

function setHash(next) {
  location.hash = logsHref(next).replace(/^#/, "");
}

export default function LogsPage() {
  const hash = useHashRoute();
  const route = useMemo(() => parseFromQuery(hash.query), [hash.query]);

  const [users, setUsers] = useState([]);
  const [runs, setRuns] = useState([]);
  const [userRuns, setUserRuns] = useState([]);
  const [detail, setDetail] = useState(null);
  const [stream, setStream] = useState("all");
  const [error, setError] = useState("");
  const [auto, setAuto] = useState(true);

  const refreshLists = useCallback(async () => {
    const data = await api("/api/logs/browse");
    setUsers(data.users || []);
    setRuns(data.runs || []);
  }, []);

  const onLive = useCallback(
    (evt) => {
      if (evt.type === "run" || evt.type === "run_event" || evt.type === "batch") {
        refreshLists().catch(() => {});
      }
    },
    [refreshLists]
  );
  const live = useLiveStream(onLive);

  useEffect(() => {
    refreshLists().catch((e) => setError(e.message));
    const t = setInterval(() => refreshLists().catch(() => {}), 10000);
    return () => clearInterval(t);
  }, [refreshLists]);

  useEffect(() => {
    if (!route.userId) {
      setUserRuns([]);
      return;
    }
    let dead = false;
    api(`/api/tokens/${route.userId}/runs`)
      .then((d) => {
        if (!dead) setUserRuns(d.runs || []);
      })
      .catch((e) => {
        if (!dead) setError(e.message);
      });
    return () => {
      dead = true;
    };
  }, [route.userId]);

  useEffect(() => {
    if (!route.runId) {
      setDetail(null);
      return;
    }
    let dead = false;
    const load = () =>
      api(`/api/runs/${route.runId}`)
        .then((d) => {
          if (!dead) {
            setDetail(d);
            setError("");
          }
        })
        .catch((e) => {
          if (!dead) setError(e.message);
        });
    load();
    const t = setInterval(() => {
      if (auto) load();
    }, 2500);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [route.runId, auto]);

  const lines = useMemo(() => {
    const logs = detail?.logs || [];
    if (stream === "all") return logs;
    return logs.filter((l) => l.stream === stream);
  }, [detail, stream]);

  const selectedUser = users.find((u) => u.id === route.userId) || null;
  const runList = route.tab === "users" ? userRuns : runs;
  const showDetail = Boolean(route.runId);

  return (
    <div className="shell">
      <Nav live={live} />

      <PageHeader
        title="Logs"
        subtitle="Inspect container output by user or by run. Everything is stored in Postgres."
        actions={
          <div className="segmented" role="tablist">
            <button
              type="button"
              className={route.tab === "users" ? "is-active" : ""}
              onClick={() =>
                setHash({ tab: "users", userId: route.userId, runId: null })
              }
            >
              Users
            </button>
            <button
              type="button"
              className={route.tab === "runs" ? "is-active" : ""}
              onClick={() => setHash({ tab: "runs", runId: route.runId })}
            >
              Runs
            </button>
          </div>
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

      <div
        className={[
          "logs-workspace",
          route.tab === "users" ? "is-users" : "is-runs",
          showDetail ? "has-detail" : "",
        ].join(" ")}
      >
        {route.tab === "users" ? (
          <section className="pane">
            <div className="pane-head">
              <h2>Users</h2>
              <span className="count">{users.length}</span>
            </div>
            <div className="pane-body">
              {users.length === 0 ? (
                <EmptyState title="No users" hint="Add tokens on Control first." />
              ) : (
                users.map((u) => (
                  <ListRow
                    key={u.id}
                    selected={route.userId === u.id}
                    title={u.username || u.label || `user #${u.id}`}
                    meta={`${u.run_count || 0} runs${
                      u.last_run_at
                        ? ` · ${new Date(u.last_run_at).toLocaleDateString()}`
                        : ""
                    }`}
                    status={!u.enabled ? "off" : null}
                    onClick={() => setHash({ tab: "users", userId: u.id })}
                  />
                ))
              )}
            </div>
          </section>
        ) : null}

        <section className="pane">
          <div className="pane-head">
            <h2>
              {route.tab === "users"
                ? selectedUser
                  ? selectedUser.username || selectedUser.label
                  : "Runs"
                : "All runs"}
            </h2>
            <span className="count">{runList.length}</span>
          </div>
          <div className="pane-body">
            {route.tab === "users" && !route.userId ? (
              <EmptyState
                title="Select a user"
                hint="Their previous runs will show here."
              />
            ) : runList.length === 0 ? (
              <EmptyState title="No runs" hint="Fire a container from Control." />
            ) : (
              runList.map((run) => (
                <ListRow
                  key={run.id}
                  selected={route.runId === run.id}
                  title={run.username || run.label || "run"}
                  status={run.status}
                  meta={`${new Date(run.started_at).toLocaleString()} · ans ${
                    run.answered ?? 0
                  } · Δ ${formatDelta(run.streak_delta)}`}
                  trailing={
                    <span className="mono subtle">{String(run.id).slice(0, 8)}</span>
                  }
                  onClick={() =>
                    setHash({
                      tab: route.tab,
                      userId:
                        route.tab === "users"
                          ? route.userId || run.token_id
                          : null,
                      runId: run.id,
                    })
                  }
                />
              ))
            )}
          </div>
        </section>

        <section className={`pane pane-detail ${showDetail ? "is-open" : ""}`}>
          {showDetail ? (
            <>
              <div className="detail-bar">
                <div className="detail-bar-main">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      setHash({
                        tab: route.tab,
                        userId: route.userId,
                        runId: null,
                      })
                    }
                  >
                    ← Back
                  </button>
                  <div className="detail-title">
                    <h2>
                      {detail?.run?.username || detail?.run?.label || "Run"}
                    </h2>
                    {detail?.run ? (
                      <StatusBadge status={detail.run.status} />
                    ) : null}
                  </div>
                  <p className="detail-meta">
                    <span className="mono">{route.runId.slice(0, 8)}</span>
                    {detail?.run?.container_name
                      ? ` · ${detail.run.container_name}`
                      : ""}
                    {detail?.run?.streak_before != null
                      ? ` · streak ${detail.run.streak_before}→${
                          detail.run.streak_after ?? "…"
                        }`
                      : ""}
                    {detail?.logs ? ` · ${lines.length} lines` : ""}
                  </p>
                  {detail?.run?.error ? (
                    <p className="detail-error">{detail.run.error}</p>
                  ) : null}
                </div>
                <div className="detail-controls">
                  <select
                    value={stream}
                    onChange={(e) => setStream(e.target.value)}
                    aria-label="Stream filter"
                  >
                    <option value="all">All streams</option>
                    <option value="events">events (runner)</option>
                    <option value="bot">bot (app + reports)</option>
                    <option value="docker">docker (npm/runtime)</option>
                  </select>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={auto}
                      onChange={(e) => setAuto(e.target.checked)}
                    />
                    Live
                  </label>
                </div>
              </div>
              <LogConsole
                lines={detail ? lines : null}
                empty="No log lines stored for this run yet."
              />
            </>
          ) : (
            <EmptyState
              title="No run selected"
              hint="Pick a run from the list to open elaborative logs."
            />
          )}
        </section>
      </div>
    </div>
  );
}
