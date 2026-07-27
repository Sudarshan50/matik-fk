import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client.js";
import { formatDelta } from "../lib/format.js";
import { logsHref } from "../lib/links.js";
import { useLiveStream } from "../hooks/useLiveStream.js";
import Nav from "../components/Nav.jsx";
import PageHeader from "../components/PageHeader.jsx";
import StatStrip from "../components/StatStrip.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ListRow from "../components/ListRow.jsx";
import TokenScheduleTable from "../components/TokenScheduleTable.jsx";

function localDateKey(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function ControlPage() {
  const [settings, setSettings] = useState(null);
  const [scheduler, setScheduler] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [active, setActive] = useState([]);
  const [recent, setRecent] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newToken, setNewToken] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [drafts, setDrafts] = useState({});

  const refresh = useCallback(async () => {
    const [s, t, r] = await Promise.all([
      api("/api/settings"),
      api("/api/tokens"),
      api("/api/runs"),
    ]);
    setSettings(s.settings);
    setScheduler(t.scheduler || s.scheduler);
    setTokens(t.tokens);
    setActive(r.active);
    setRecent(r.recent);
    setDrafts((prev) => {
      const next = { ...prev };
      for (const token of t.tokens) {
        if (!next[token.id]) {
          next[token.id] = {
            scheduleEnabled: Boolean(token.schedule_enabled),
            scheduleTime: token.schedule_time || "09:00",
            email: token.email || "",
          };
        }
      }
      for (const id of Object.keys(next)) {
        if (!t.tokens.some((tok) => String(tok.id) === String(id))) {
          delete next[id];
        }
      }
      return next;
    });
  }, []);

  const onLive = useCallback(
    (evt) => {
      if (evt.type === "run" || evt.type === "run_event" || evt.type === "batch") {
        refresh().catch(() => {});
      }
    },
    [refresh]
  );
  const live = useLiveStream(onLive);

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    const poll = setInterval(() => refresh().catch(() => {}), 8000);
    return () => clearInterval(poll);
  }, [refresh]);

  const activeIds = useMemo(
    () => new Set(active.map((r) => r.token_id)),
    [active]
  );

  const jobByToken = useMemo(() => {
    const map = new Map();
    for (const job of scheduler?.jobs || []) map.set(job.tokenId, job);
    return map;
  }, [scheduler]);

  const stats = useMemo(() => {
    const today = localDateKey(new Date().toISOString());
    return [
      {
        label: "Enabled",
        value: tokens.filter((t) => t.enabled).length,
      },
      {
        label: "Scheduled",
        value: tokens.filter((t) => t.enabled && t.schedule_enabled).length,
      },
      { label: "Active", value: active.length },
      {
        label: "Done today",
        value: recent.filter(
          (r) => r.status === "completed" && localDateKey(r.started_at) === today
        ).length,
      },
    ];
  }, [tokens, active, recent]);

  async function saveSettings(patch) {
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/settings", {
        method: "PUT",
        body: JSON.stringify(patch),
      });
      setSettings(data.settings);
      setScheduler(data.scheduler);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function fireNow(tokenIds = null) {
    setBusy(true);
    setError("");
    try {
      await api("/api/fire", {
        method: "POST",
        body: JSON.stringify({
          tokenIds: tokenIds?.length ? tokenIds : undefined,
          maxParallel: Number(settings.max_parallel),
          staggerSeconds: Number(settings.stagger_seconds),
        }),
      });
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function addToken() {
    if (!newToken.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/tokens", {
        method: "POST",
        body: JSON.stringify({
          label: newLabel || undefined,
          refreshToken: newToken.trim(),
          email: newEmail.trim() || undefined,
        }),
      });
      setNewLabel("");
      setNewToken("");
      setNewEmail("");
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleToken(token) {
    setError("");
    try {
      const data = await api(`/api/tokens/${token.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !token.enabled }),
      });
      if (data.scheduler) setScheduler(data.scheduler);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  async function removeToken(id) {
    if (!confirm("Remove this token?")) return;
    setError("");
    try {
      const data = await api(`/api/tokens/${id}`, { method: "DELETE" });
      if (data.scheduler) setScheduler(data.scheduler);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  function updateDraft(id, patch) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  }

  async function saveTokenSchedule(token) {
    const draft = drafts[token.id];
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      const data = await api(`/api/tokens/${token.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          scheduleEnabled: draft.scheduleEnabled,
          scheduleTime: draft.scheduleTime,
          email: draft.email || null,
        }),
      });
      if (data.scheduler) setScheduler(data.scheduler);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[token.id];
        return next;
      });
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function scheduleDirty(token) {
    const draft = drafts[token.id];
    if (!draft) return false;
    return (
      draft.scheduleEnabled !== Boolean(token.schedule_enabled) ||
      draft.scheduleTime !== (token.schedule_time || "09:00") ||
      (draft.email || "") !== (token.email || "")
    );
  }

  if (!settings) {
    return (
      <div className="shell">
        <Nav />
        <EmptyState title="Loading control plane…" />
      </div>
    );
  }

  return (
    <div className="shell">
      <Nav live={live} />

      <PageHeader
        title="Control"
        subtitle="Manage per-user schedules, fire bots, and watch live runs."
        actions={
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !tokens.some((t) => t.enabled)}
            onClick={() => fireNow()}
          >
            Fire all now
          </button>
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

      <TokenScheduleTable
        tokens={tokens}
        drafts={drafts}
        settings={settings}
        activeIds={activeIds}
        jobByToken={jobByToken}
        busy={busy}
        onUpdateDraft={updateDraft}
        onSaveSchedule={saveTokenSchedule}
        onFire={fireNow}
        onToggle={toggleToken}
        onRemove={removeToken}
        scheduleDirty={scheduleDirty}
        newLabel={newLabel}
        newToken={newToken}
        newEmail={newEmail}
        onNewLabel={setNewLabel}
        onNewToken={setNewToken}
        onNewEmail={setNewEmail}
        onAdd={addToken}
      />

      <div className="control-secondary">
        <section className="card">
          <div className="card-head">
            <h2>Launch defaults</h2>
            <span className="pill">
              {scheduler?.armedCount
                ? `${scheduler.armedCount} schedule${
                    scheduler.armedCount === 1 ? "" : "s"
                  } armed`
                : "No schedules armed"}
            </span>
          </div>
          <p className="card-note">
            Shared launch settings. Daily fire times are set per user in the table
            above.
          </p>
          <div className="form-grid form-grid-compact">
            <label className="field">
              Default timezone
              <input
                value={settings.timezone}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, timezone: e.target.value }))
                }
              />
            </label>
            <label className="field">
              Max parallel
              <input
                type="number"
                min="1"
                max="20"
                value={settings.max_parallel}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, max_parallel: e.target.value }))
                }
              />
            </label>
            <label className="field">
              Stagger (sec)
              <input
                type="number"
                min="0"
                max="300"
                value={settings.stagger_seconds}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, stagger_seconds: e.target.value }))
                }
              />
            </label>
            <label className="field">
              Match loops
              <input
                type="number"
                min="1"
                max="10"
                value={settings.match_loops}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, match_loops: e.target.value }))
                }
              />
            </label>
            <label className="field">
              Retries
              <input
                type="number"
                min="0"
                max="5"
                value={settings.max_retries ?? 2}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, max_retries: e.target.value }))
                }
              />
            </label>
            <label className="field">
              Failsafe (min)
              <input
                type="number"
                min="2"
                max="60"
                value={settings.failsafe_timeout_min ?? 8}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    failsafe_timeout_min: e.target.value,
                  }))
                }
              />
            </label>
            <label className="field field-span">
              Search URL
              <input
                value={settings.search_url}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, search_url: e.target.value }))
                }
              />
            </label>
          </div>
          <div className="card-actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() =>
                saveSettings({
                  timezone: settings.timezone,
                  max_parallel: settings.max_parallel,
                  stagger_seconds: settings.stagger_seconds,
                  match_loops: settings.match_loops,
                  max_retries: settings.max_retries,
                  failsafe_timeout_min: settings.failsafe_timeout_min,
                  search_url: settings.search_url,
                })
              }
            >
              Save defaults
            </button>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Live containers</h2>
          </div>
          <div className="stack-sm">
            {active.length === 0 ? (
              <EmptyState title="Nothing running" hint="Fire a token to start." />
            ) : (
              active.map((run) => (
                <ListRow
                  key={run.id}
                  as="a"
                  href={logsHref({ tab: "runs", runId: run.id })}
                  title={run.username || run.label}
                  status={run.phase || run.status}
                  meta={`answers ${run.answered ?? 0} · open logs`}
                  trailing={
                    <span className="mono subtle">
                      {formatDelta(run.streak_delta)}
                    </span>
                  }
                />
              ))
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Last runs</h2>
            <a className="btn btn-ghost btn-sm" href={logsHref({ tab: "runs" })}>
              View all →
            </a>
          </div>
          <div className="stack-sm">
            {recent.length === 0 ? (
              <EmptyState title="No runs yet" />
            ) : (
              recent.slice(0, 8).map((run) => (
                <ListRow
                  key={run.id}
                  as="a"
                  href={logsHref({
                    tab: run.token_id ? "users" : "runs",
                    userId: run.token_id || null,
                    runId: run.id,
                  })}
                  title={run.username || run.label}
                  status={run.status}
                  meta={`${new Date(run.started_at).toLocaleString()} · answers ${
                    run.answered ?? 0
                  }`}
                  trailing={
                    <span className="mono subtle">
                      Δ {formatDelta(run.streak_delta)}
                    </span>
                  }
                />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
