"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { Avatar, useProfile } from "@/components/AccountMenu";
import { Icon } from "@/components/Menu";
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
import { clearHistory, exportState, getPrefs, setPrefs, setProfile, type Prefs } from "@/lib/storage";
import { login, logout, syncNow, useAccount } from "@/lib/sync";

type SectionId = "profile" | "connections" | "data" | "watching" | "history" | "shortcuts";

const NAV: { group: string; items: { id: SectionId; label: string; icon: string }[] }[] = [
  {
    group: "Account",
    items: [
      { id: "profile", label: "Profile & account", icon: "user" },
      { id: "connections", label: "Connected accounts", icon: "layers" },
      { id: "data", label: "Data management", icon: "library" },
    ],
  },
  {
    group: "Preferences",
    items: [
      { id: "watching", label: "Watching", icon: "play" },
      { id: "history", label: "History & progress", icon: "rewatch" },
    ],
  },
  { group: "Shortcuts", items: [{ id: "shortcuts", label: "Keyboard", icon: "grid" }] },
];
const TITLES = Object.fromEntries(NAV.flatMap((g) => g.items.map((i) => [i.id, i.label]))) as Record<SectionId, string>;
const ALL_SECTIONS = Object.keys(TITLES) as SectionId[];

function ago(t: number) {
  if (!t) return "never";
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`;
}

// --- Building blocks ---------------------------------------------------------

/** The settings search; rows that don't match hide themselves. */
const SearchContext = createContext("");

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="sgroup">
      <h3>{title}</h3>
      <div className="sgroup__card">{children}</div>
    </section>
  );
}

/** One setting: title, description, where it's kept, and its control. */
function Row({
  title,
  desc,
  where,
  children,
  wide,
}: {
  title: string;
  desc?: string;
  where?: "device" | "account";
  children?: React.ReactNode;
  wide?: boolean;
}) {
  const q = useContext(SearchContext).trim().toLowerCase();
  if (q && !`${title} ${desc ?? ""}`.toLowerCase().includes(q)) return null;
  return (
    <div className={`srow ${wide ? "srow--wide" : ""}`}>
      <div className="srow__text">
        <strong>
          {title}
          {where ? (
            <span className="srow__where" title={where === "device" ? "Saved on this device" : "Synced with your account"}>
              <Icon name={where === "device" ? "monitor" : "cloud"} size={13} />
            </span>
          ) : null}
        </strong>
        {desc ? <span>{desc}</span> : null}
      </div>
      {children ? <div className="srow__control">{children}</div> : null}
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span />
    </label>
  );
}

function usePrefs(): [Prefs | null, (p: Partial<Prefs>) => void] {
  const [prefs, setState] = useState<Prefs | null>(null);
  useEffect(() => setState(getPrefs()), []);
  return [
    prefs,
    (p) => {
      setPrefs(p);
      setState(getPrefs());
    },
  ];
}

// --- Page ----------------------------------------------------------------------

export default function SettingsPage() {
  const router = useRouter();
  const { user } = useAccount();
  const profile = useProfile();
  const [section, setSection] = useState<SectionId>("profile");
  const [q, setQ] = useState("");

  // #watching etc. open that section (links elsewhere point here).
  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.slice(1);
      const aliases: Record<string, SectionId> = { account: "profile", anilist: "connections", import: "connections", playback: "watching" };
      const id = (aliases[h] ?? h) as SectionId;
      if (id in TITLES) setSection(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === "Escape" && tag !== "INPUT" && tag !== "SELECT") router.back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  function open(id: SectionId) {
    setSection(id);
    setQ("");
    window.history.replaceState(null, "", `#${id}`);
  }

  const name = user ?? profile.anilist?.name ?? profile.anilistUser ?? "Guest";
  const searching = q.trim().length > 0;
  const shown = searching ? ALL_SECTIONS : [section];

  return (
    <div className="sset">
      <aside className="sset__nav">
        <div className="sset__me">
          <Avatar src={profile.avatar} name={name} size={34} />
          <strong>{name}</strong>
        </div>
        <label className="sset__search">
          <Icon name="search" size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search settings" />
        </label>
        {NAV.map((g) => (
          <nav key={g.group} className="sset__group">
            <span>{g.group}</span>
            {g.items.map((it) => (
              <button key={it.id} className={!searching && section === it.id ? "is-active" : ""} onClick={() => open(it.id)}>
                <Icon name={it.icon} size={16} />
                {it.label}
              </button>
            ))}
          </nav>
        ))}
        <span className="sset__ver">AnimeStream</span>
      </aside>

      <main className="sset__main">
        <button className="sset__close" onClick={() => router.back()} aria-label="Close settings">
          <Icon name="close" size={20} />
          <span>ESC</span>
        </button>
        <SearchContext.Provider value={q}>
          {shown.map((id) => (
            <div key={id} className="sset__section">
              <h1>{TITLES[id]}</h1>
              {id !== "shortcuts" ? (
                <div className="sset__banner">
                  <Icon name={user ? "cloud" : "monitor"} size={14} />
                  {user ? (
                    <span>
                      Synced with your account. Settings marked <Icon name="monitor" size={12} /> apply to this device only.
                    </span>
                  ) : (
                    <span>
                      Saved on this device.{" "}
                      <button className="link-btn" onClick={() => open("profile")}>
                        Sign in
                      </button>{" "}
                      to sync your lists and history across devices.
                    </span>
                  )}
                </div>
              ) : null}
              {id === "profile" ? <ProfileSection /> : null}
              {id === "connections" ? <ConnectionsSection /> : null}
              {id === "data" ? <DataSection /> : null}
              {id === "watching" ? <WatchingSection /> : null}
              {id === "history" ? <HistorySection /> : null}
              {id === "shortcuts" ? <ShortcutsSection /> : null}
            </div>
          ))}
        </SearchContext.Provider>
      </main>
    </div>
  );
}

// --- Sections ------------------------------------------------------------------

function ProfileSection() {
  const profile = useProfile();
  const { user, status, lastSynced } = useAccount();
  const [url, setUrl] = useState("");
  useEffect(() => setUrl(profile.avatar ?? ""), [profile.avatar]);
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
    <>
      <Group title="Account">
        {user === undefined ? (
          <Row title="Account" desc="Checking…" />
        ) : user ? (
          <Row
            title={`Signed in as ${user}`}
            desc={
              status === "syncing"
                ? "Syncing…"
                : status === "error"
                  ? "Couldn't reach the server — will retry."
                  : status === "offline"
                    ? "Offline — changes will sync when you're back."
                    : `Lists, history and positions synced ${ago(lastSynced)}.`
            }
            where="account"
          >
            <button className="sbtn" onClick={() => logout()}>
              Sign out
            </button>
          </Row>
        ) : (
          <Row
            title={mode === "login" ? "Sign in" : "Create an account"}
            desc="Keeps your lists, Continue Watching and positions on every device."
            wide
          >
            <form className="sform" onSubmit={submit}>
              <div className="sform__tabs">
                <button type="button" className={mode === "login" ? "is-active" : ""} onClick={() => setMode("login")}>
                  Sign in
                </button>
                <button type="button" className={mode === "signup" ? "is-active" : ""} onClick={() => setMode("signup")}>
                  Create account
                </button>
              </div>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Username" autoComplete="username" required minLength={3} maxLength={24} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (8+ characters)"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={8}
              />
              {authError ? <p className="form__error">{authError}</p> : null}
              <button className="sbtn sbtn--primary" disabled={busy}>
                {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
              </button>
            </form>
          </Row>
        )}
      </Group>

      <Group title="Profile">
        <Row title="Avatar" desc="An image link. Shown in the header and on My List." where="account" wide>
          <form
            className="sinline"
            onSubmit={(e) => {
              e.preventDefault();
              setProfile({ avatar: url.trim() || null });
            }}
          >
            <Avatar src={profile.avatar} name={user ?? "G"} size={40} />
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/avatar.png" type="url" />
            <button className="sbtn">Save</button>
            {profile.anilist?.avatar ? (
              <button type="button" className="sbtn" onClick={() => setProfile({ avatar: profile.anilist!.avatar })}>
                Use AniList
              </button>
            ) : null}
            {profile.avatar ? (
              <button type="button" className="sbtn" onClick={() => setProfile({ avatar: null })}>
                Remove
              </button>
            ) : null}
          </form>
        </Row>
      </Group>
    </>
  );
}

function ConnectionsSection() {
  const profile = useProfile();
  const link = profile.anilist && profile.anilist.expiresAt > Date.now() ? profile.anilist : null;
  const expired = !!profile.anilist && !link;
  const [username, setUsername] = useState("");
  const [state, setState] = useState<{ busy?: boolean; error?: string; done?: string }>({});
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
  }

  return (
    <Group title="AniList">
      {link ? (
        <>
          <Row title={`Connected as ${link.name}`} desc={`Two-way sync · last pulled ${ago(lastPull())}`} where="account">
            <button className="sbtn" disabled={state.busy} onClick={() => run(async () => `Pulled ${(await pullFromAniList())?.total ?? 0} entries.`)}>
              {state.busy ? "Syncing…" : "Sync now"}
            </button>
            <button className="sbtn" onClick={() => disconnect()}>
              Disconnect
            </button>
          </Row>
          <Row title="Update AniList as I watch" desc="Finishing an episode or changing a list here updates your AniList too." where="account">
            <Switch checked={link.autoSync} onChange={setAutoSync} label="Update AniList as I watch" />
          </Row>
        </>
      ) : profile.anilistUser ? (
        <Row
          title={`Following ${profile.anilistUser}`}
          desc={`One-way: your public AniList list is re-imported every 30 minutes · last ${ago(lastPull())}`}
          where="account"
        >
          <button className="sbtn" disabled={state.busy} onClick={() => run(async () => `Pulled ${(await pullFromAniList())?.total ?? 0} entries.`)}>
            {state.busy ? "Syncing…" : "Sync now"}
          </button>
          <button className="sbtn" onClick={() => disconnect()}>
            Unlink
          </button>
        </Row>
      ) : (
        <>
          <Row
            title="Connect AniList"
            desc={
              ANILIST_CLIENT_ID
                ? "Two-way: episodes you finish here update your AniList, and your full list (private entries too) comes back."
                : `Needs NEXT_PUBLIC_ANILIST_CLIENT_ID (AniList → Settings → Developer → Create New Client, redirect URL ${origin}/settings/anilist).`
            }
          >
            {ANILIST_CLIENT_ID ? (
              <a className="sbtn sbtn--primary" href={connectUrl()}>
                Connect
              </a>
            ) : null}
          </Row>
          <Row title="Follow a public username" desc="One-way, no login: your public AniList list and favourites are re-imported every 30 minutes." wide>
            <form
              className="sinline"
              onSubmit={(e) => {
                e.preventDefault();
                const name = username.trim();
                if (!name) return;
                run(async () => {
                  const { counts, total } = await linkUsername(name);
                  const parts = LIST_STATUSES.filter((s) => counts[s.id]).map((s) => `${counts[s.id]} ${s.label.toLowerCase()}`);
                  return `Linked — ${total} shows${parts.length ? ` (${parts.join(", ")})` : ""}.`;
                });
              }}
            >
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="AniList username" />
              <button className="sbtn" disabled={state.busy}>
                {state.busy ? "Linking…" : "Link"}
              </button>
            </form>
          </Row>
        </>
      )}
      {expired ? <Row title="AniList login expired" desc="Connect again to keep two-way sync working." /> : null}
      {state.error || state.done ? (
        <div className="srow srow--msg">
          {state.error ? <p className="form__error">{state.error}</p> : <p className="form__ok">{state.done}</p>}
        </div>
      ) : null}
    </Group>
  );
}

function DataSection() {
  const { user } = useAccount();
  const [done, setDone] = useState<string | null>(null);

  function download() {
    const blob = new Blob([JSON.stringify(exportState(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `animestream-library-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <Group title="Your data">
        {user ? (
          <Row title="Sync now" desc="Push this device's changes and pull the latest from your account." where="account">
            <button className="sbtn" onClick={() => syncNow().then(() => setDone("Synced."))}>
              Sync now
            </button>
          </Row>
        ) : null}
        <Row title="Export my data" desc="Download your lists, favourites, history and positions as a JSON file.">
          <button className="sbtn" onClick={download}>
            Export
          </button>
        </Row>
      </Group>
      <Group title="Danger zone">
        <Row title="Clear watch history" desc="Removes everything from Continue Watching and forgets playback positions." where="account">
          <button
            className="sbtn sbtn--danger"
            onClick={() => {
              if (confirm("Clear your whole watch history? Your lists stay as they are.")) {
                clearHistory();
                setDone("Watch history cleared.");
              }
            }}
          >
            Clear
          </button>
        </Row>
      </Group>
      {done ? <p className="form__ok">{done}</p> : null}
    </>
  );
}

function WatchingSection() {
  const [prefs, update] = usePrefs();
  const [providers, setProviders] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    fetch("/api/providers")
      .then((r) => r.json())
      .then(setProviders)
      .catch(() => {});
  }, []);
  if (!prefs) return null;

  return (
    <>
      <Group title="Playback">
        <Row title="Preferred provider" desc="The server to start on. A server you pick for a specific show takes priority." where="device">
          <select className="sselect" value={prefs.preferredSource} onChange={(e) => update({ preferredSource: e.target.value })}>
            <option value="">Automatic</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Row>
        <Row title="Default audio" desc="Sub (Japanese audio) or Dub (English audio) when a server offers both." where="device">
          <select className="sselect" value={prefs.audio ?? "sub"} onChange={(e) => update({ audio: e.target.value as "sub" | "dub" })}>
            <option value="sub">Sub</option>
            <option value="dub">Dub</option>
          </select>
        </Row>
        <Row title="Autoplay" desc="Start playing when an episode opens." where="device">
          <Switch checked={prefs.autoStart} onChange={(v) => update({ autoStart: v })} label="Autoplay" />
        </Row>
        <Row title="Autoplay next" desc="Continue to the next episode when one ends." where="device">
          <Switch checked={prefs.autoplay} onChange={(v) => update({ autoplay: v })} label="Autoplay next" />
        </Row>
        <Row title="Auto-skip intro and outro" desc="Skip detected openings and endings." where="device">
          <Switch checked={prefs.autoSkip} onChange={(v) => update({ autoSkip: v })} label="Auto-skip intro and outro" />
        </Row>
      </Group>
      <Group title="Watch page">
        <Row title="Episode list layout" desc="Detailed cards or a compact number grid. Auto uses the grid for long shows." where="device">
          <select
            className="sselect"
            value={prefs.episodeLayout}
            onChange={(e) => update({ episodeLayout: e.target.value as Prefs["episodeLayout"] })}
          >
            <option value="auto">Auto</option>
            <option value="list">Detailed list</option>
            <option value="grid">Number grid</option>
          </select>
        </Row>
        <Row title="Hide spoilers" desc="Blur stills and hide descriptions of episodes you haven't reached." where="device">
          <Switch checked={prefs.hideSpoilers} onChange={(v) => update({ hideSpoilers: v })} label="Hide spoilers" />
        </Row>
        <Row title="Subtitle style" desc="Size, colours, outline and timing are set from the Aa button on the video." where="device" />
      </Group>
    </>
  );
}

function HistorySection() {
  const [prefs, update] = usePrefs();
  if (!prefs) return null;
  const pct = Math.round(prefs.syncThreshold * 100);

  return (
    <>
      <Group title="Watch history">
        <Row title="Pause watch history" desc="Stop recording episodes and playback positions from this browser." where="device">
          <Switch checked={prefs.pauseHistory} onChange={(v) => update({ pauseHistory: v })} label="Pause watch history" />
        </Row>
        <Row title="Watch history on home page" desc="Show Continue Watching on the home page." where="device">
          <Switch checked={prefs.homeHistory} onChange={(v) => update({ homeHistory: v })} label="Watch history on home page" />
        </Row>
        <Row title="Watch history" desc="Review or remove entries in My List → Continue watching." where="account">
          <Link className="sbtn" href="/library?view=history">
            <Icon name="rewatch" size={15} /> Manage history
          </Link>
        </Row>
      </Group>
      <Group title="List progress">
        <Row
          title="Auto sync"
          desc='Move episode progress along in your list for shows set to "Watching" or "Re-watching". With AniList connected, the change goes to AniList too.'
          where="device"
        >
          <Switch checked={prefs.autoSyncList} onChange={(v) => update({ autoSyncList: v })} label="Auto sync" />
        </Row>
        <Row title="Sync threshold" desc="How much of an episode to watch before it counts. The default is 80%." where="device">
          <div className="srange">
            <input
              type="range"
              min={50}
              max={100}
              step={5}
              value={pct}
              onChange={(e) => update({ syncThreshold: Number(e.target.value) / 100 })}
              aria-label="Sync threshold"
            />
            <span>{pct}%</span>
          </div>
        </Row>
      </Group>
    </>
  );
}

const SHORTCUTS: [string, string][] = [
  ["Space / K", "Play or pause"],
  ["← / →", "Back / forward 10 seconds"],
  ["↑ / ↓", "Volume up / down"],
  ["M", "Mute"],
  ["F", "Fullscreen"],
  ["C", "Subtitles on / off"],
  ["S", "Skip intro or outro"],
  ["N", "Next episode"],
  ["Esc", "Close menus and settings"],
];

function ShortcutsSection() {
  return (
    <Group title="Player and site">
      {SHORTCUTS.map(([keys, what]) => (
        <Row key={keys} title={what}>
          <span className="skeys">
            {keys.split(" / ").map((k) => (
              <kbd key={k}>{k}</kbd>
            ))}
          </span>
        </Row>
      ))}
    </Group>
  );
}
