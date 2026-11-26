"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar, useProfile } from "@/components/AccountMenu";
import {
  ANILIST_CLIENT_ID,
  connectUrl,
  disconnect,
  lastPull,
  linkUsername,
  pullFromAniList,
  setAutoSync,
} from "@/lib/anilist-sync";
import { LIST_STATUSES } from "@/lib/state";
import { getPrefs, setPrefs, setProfile, type Prefs } from "@/lib/storage";
import { importList, login, logout, syncNow, useAccount } from "@/lib/sync";

function ago(t: number) {
  if (!t) return "never";
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`;
}

function countsText(counts: Record<string, number>, total: number) {
  const parts = LIST_STATUSES.filter((s) => counts[s.id]).map((s) => `${counts[s.id]} ${s.label.toLowerCase()}`);
  return `Imported ${total} shows${parts.length ? ` — ${parts.join(", ")}` : ""}.`;
}

export default function SettingsPage() {
  return (
    <div className="container page settings">
      <h1 className="page__title">Settings</h1>
      <nav className="settings__nav">
        <a href="#profile">Profile</a>
        <a href="#account">Account &amp; sync</a>
        <a href="#anilist">AniList</a>
        <a href="#import">Import</a>
        <a href="#playback">Playback</a>
      </nav>
      <ProfileSection />
      <AccountSection />
      <AniListSection />
      <ImportSection />
      <PlaybackSection />
    </div>
  );
}

function ProfileSection() {
  const profile = useProfile();
  const { user } = useAccount();
  const [url, setUrl] = useState("");
  useEffect(() => setUrl(profile.avatar ?? ""), [profile.avatar]);
  const name = user ?? profile.anilist?.name ?? profile.anilistUser ?? "Guest";
  const anilistAvatar = profile.anilist?.avatar;

  return (
    <section className="panel settings__section" id="profile">
      <h2>Profile</h2>
      <div className="settings__profile">
        <Avatar src={profile.avatar} name={name} size={72} />
        <form
          className="settings__inline"
          onSubmit={(e) => {
            e.preventDefault();
            setProfile({ avatar: url.trim() || null });
          }}
        >
          <label>
            Avatar image URL
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/avatar.png" type="url" />
          </label>
          <div className="settings__row">
            <button className="btn btn--sm btn--primary">Save</button>
            {anilistAvatar ? (
              <button type="button" className="btn btn--sm" onClick={() => setProfile({ avatar: anilistAvatar })}>
                Use AniList avatar
              </button>
            ) : null}
            {profile.avatar ? (
              <button type="button" className="btn btn--sm" onClick={() => setProfile({ avatar: null })}>
                Remove
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </section>
  );
}

function AccountSection() {
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
    <section className="panel settings__section" id="account">
      <h2>Account &amp; sync</h2>
      {user === undefined ? (
        <div className="spinner" />
      ) : user ? (
        <div className="panel__row">
          <div>
            <p>
              Signed in as <strong>{user}</strong>. Continue watching, positions, lists, favourites and settings sync to every
              device you sign in on.
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
      ) : (
        <>
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
        </>
      )}
    </section>
  );
}

function AniListSection() {
  const profile = useProfile();
  const link = profile.anilist && profile.anilist.expiresAt > Date.now() ? profile.anilist : null;
  const expired = !!profile.anilist && !link;
  const [username, setUsername] = useState("");
  const [state, setState] = useState<{ busy?: boolean; error?: string; done?: string }>({});
  const [, tick] = useState(0);
  // Known only in the browser; filled in after mount so server and client render the same.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  async function run(fn: () => Promise<string>) {
    setState({ busy: true });
    try {
      setState({ done: await fn() });
    } catch (e) {
      setState({ error: (e as Error).message });
    }
    tick((n) => n + 1);
  }

  return (
    <section className="panel settings__section" id="anilist">
      <h2>AniList</h2>
      {link ? (
        <>
          <div className="settings__linked">
            <Avatar src={link.avatar} name={link.name} size={44} />
            <div>
              <strong>Connected as {link.name}</strong>
              <span className="muted">Two-way sync · last pulled {ago(lastPull())}</span>
            </div>
          </div>
          <label className="settings__toggle">
            <input type="checkbox" checked={link.autoSync} onChange={(e) => setAutoSync(e.target.checked)} />
            Update my AniList when I watch or change a list here
          </label>
          <div className="settings__row">
            <button className="btn btn--sm" disabled={state.busy} onClick={() => run(async () => `Pulled ${(await pullFromAniList())?.total ?? 0} entries from AniList.`)}>
              {state.busy ? "Syncing…" : "Sync from AniList now"}
            </button>
            <button className="btn btn--sm" onClick={() => disconnect()}>
              Disconnect
            </button>
          </div>
        </>
      ) : profile.anilistUser ? (
        <>
          <div className="settings__linked">
            <div>
              <strong>Following {profile.anilistUser}</strong>
              <span className="muted">One-way: re-imported every 30 min · last {ago(lastPull())}</span>
            </div>
          </div>
          <div className="settings__row">
            <button className="btn btn--sm" disabled={state.busy} onClick={() => run(async () => `Pulled ${(await pullFromAniList())?.total ?? 0} entries.`)}>
              {state.busy ? "Syncing…" : "Sync now"}
            </button>
            <button className="btn btn--sm" onClick={() => disconnect()}>
              Unlink
            </button>
          </div>
        </>
      ) : (
        <div className="settings__choices">
          <div>
            <h3>Connect your AniList</h3>
            <p className="muted">
              Two-way: episodes you finish here update your AniList, and your full list (private entries too) comes back here.
            </p>
            {ANILIST_CLIENT_ID ? (
              <a className="btn btn--primary btn--sm" href={connectUrl()}>
                Connect AniList
              </a>
            ) : (
              <p className="notice">
                The site owner needs to add <code>NEXT_PUBLIC_ANILIST_CLIENT_ID</code> first (free, instant: AniList → Settings →
                Developer → Create New Client, redirect URL <code>{origin}/settings/anilist</code>).
              </p>
            )}
            {expired ? <p className="form__error">Your AniList login expired — connect again.</p> : null}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const name = username.trim();
              if (name) {
                run(async () => {
                  const { counts, total } = await linkUsername(name);
                  return countsText(counts, total);
                });
              }
            }}
          >
            <h3>…or follow a public username</h3>
            <p className="muted">One-way, no login: your public AniList list is re-imported automatically every 30 minutes.</p>
            <div className="import__row">
              <input className="settings__input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="AniList username" />
              <button className="btn btn--sm" disabled={state.busy}>
                {state.busy ? "Linking…" : "Link"}
              </button>
            </div>
          </form>
        </div>
      )}
      {state.error ? <p className="form__error">{state.error}</p> : null}
      {state.done ? <p className="form__ok">{state.done}</p> : null}
    </section>
  );
}

function ImportSection() {
  return (
    <section className="panel settings__section" id="import">
      <h2>Import lists</h2>
      <p className="muted">
        One-off import of Watching, Planning, Completed, Paused and Dropped with progress, scores and favourites. Shows you&apos;re
        watching appear in Continue Watching on the next episode. Lists must be public.
      </p>
      <div className="imports">
        <ImportCard service="anilist" name="AniList" placeholder="AniList username" />
        <ImportCard service="mal" name="MyAnimeList" placeholder="MAL username" />
      </div>
      <p>
        <Link href="/library">Go to My List →</Link>
      </p>
    </section>
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
      setState({ done: countsText(counts, total) });
    } catch (err) {
      setState({ error: (err as Error).message });
    }
  }

  return (
    <form className={`import import--${service}`} onSubmit={run}>
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

function PlaybackSection() {
  const [prefs, setState] = useState<Prefs | null>(null);
  useEffect(() => setState(getPrefs()), []);
  if (!prefs) return null;
  const update = (p: Partial<Prefs>) => {
    setPrefs(p);
    setState({ ...prefs, ...p });
  };
  return (
    <section className="panel settings__section" id="playback">
      <h2>Playback</h2>
      <label className="settings__toggle">
        <input type="checkbox" checked={prefs.autoplay} onChange={(e) => update({ autoplay: e.target.checked })} />
        Autoplay next episode
      </label>
      <label className="settings__toggle">
        <input type="checkbox" checked={prefs.autoSkip} onChange={(e) => update({ autoSkip: e.target.checked })} />
        Auto-skip intro and outro
      </label>
      <label className="settings__toggle">
        <input type="checkbox" checked={prefs.hideSpoilers ?? true} onChange={(e) => update({ hideSpoilers: e.target.checked })} />
        Hide episode stills and descriptions I haven&apos;t reached
      </label>
      <label className="settings__select">
        Default audio
        <select className="select" value={prefs.audio ?? "sub"} onChange={(e) => update({ audio: e.target.value as "sub" | "dub" })}>
          <option value="sub">Sub (Japanese audio)</option>
          <option value="dub">Dub (English audio)</option>
        </select>
      </label>
      <p className="muted">Subtitle size and colours are set from the Aa button on the video.</p>
    </section>
  );
}
