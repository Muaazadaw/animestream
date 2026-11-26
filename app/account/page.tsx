"use client";

import Link from "next/link";
import { useState } from "react";
import { LIST_STATUSES } from "@/lib/state";
import { importList, login, logout, syncNow, useAccount } from "@/lib/sync";

function ago(t: number) {
  if (!t) return "never";
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
}

export default function AccountPage() {
  const { user, status, lastSynced } = useAccount();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setAuthError(await login(mode, name, password));
    setBusy(false);
    setPassword("");
  }

  return (
    <div className="container page account">
      <h1 className="page__title">Account</h1>

      {user === undefined ? (
        <div className="spinner" />
      ) : user ? (
        <section className="panel">
          <div className="panel__row">
            <div>
              <h2>Signed in as {user}</h2>
              <p className="muted">
                Your continue watching, positions, watchlist and lists sync to every device you sign in on.
              </p>
              <p className={`sync-status sync-status--${status}`}>
                {status === "syncing"
                  ? "Syncing…"
                  : status === "error"
                    ? "Couldn't reach the server — will retry."
                    : status === "offline"
                      ? "Offline — changes will sync when you're back."
                      : `Synced ${ago(lastSynced)}`}
              </p>
            </div>
            <div className="panel__actions">
              <button className="btn btn--sm" onClick={() => syncNow()}>
                Sync now
              </button>
              <button className="btn btn--sm" onClick={() => logout()}>
                Sign out
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="panel">
          <div className="tabs">
            <button className={mode === "login" ? "is-active" : ""} onClick={() => setMode("login")}>
              Sign in
            </button>
            <button className={mode === "signup" ? "is-active" : ""} onClick={() => setMode("signup")}>
              Create account
            </button>
          </div>
          <form className="form" onSubmit={submit}>
            <label>
              Username
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" required minLength={3} maxLength={24} />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={8}
              />
            </label>
            {authError ? <p className="form__error">{authError}</p> : null}
            <button className="btn btn--primary" disabled={busy}>
              {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
            <p className="muted form__note">
              Without an account your history stays in this browser only. Signing in keeps it on every device.
            </p>
          </form>
        </section>
      )}

      <h2 className="section-title">Import your lists</h2>
      <p className="muted">
        Brings in Watching, Planning, Completed, Paused and Dropped, with episode progress and scores. Shows you&apos;re
        watching appear in Continue Watching on the next episode. Lists must be public.
      </p>
      <div className="imports">
        <ImportCard service="anilist" name="AniList" placeholder="AniList username" />
        <ImportCard service="mal" name="MyAnimeList" placeholder="MAL username" />
      </div>
      <p>
        <Link href="/library">Go to My List →</Link>
      </p>
    </div>
  );
}

function ImportCard({ service, name, placeholder }: { service: "anilist" | "mal"; name: string; placeholder: string }) {
  const [username, setUsername] = useState("");
  const [state, setState] = useState<{ busy?: boolean; error?: string; done?: string }>({});

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setState({ busy: true });
    try {
      const { counts, total } = await importList(service, username.trim());
      const parts = LIST_STATUSES.filter((s) => counts[s.id]).map((s) => `${counts[s.id]} ${s.label.toLowerCase()}`);
      setState({ done: `Imported ${total} shows${parts.length ? ` — ${parts.join(", ")}` : ""}.` });
    } catch (err) {
      setState({ error: (err as Error).message });
    }
  }

  return (
    <form className={`panel import import--${service}`} onSubmit={run}>
      <h3>{name}</h3>
      <div className="import__row">
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={placeholder} required />
        <button className="btn btn--primary btn--sm" disabled={state.busy}>
          {state.busy ? "Importing…" : "Import"}
        </button>
      </div>
      {state.error ? <p className="form__error">{state.error}</p> : null}
      {state.done ? <p className="form__ok">{state.done}</p> : null}
    </form>
  );
}
