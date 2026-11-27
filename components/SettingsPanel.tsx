"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Avatar, useProfile } from "@/components/AccountMenu";
import { Icon } from "@/components/Menu";
import {
  ANILIST_CLIENT_ID,
  connectUrl,
  lastPull,
  pullFromAniList,
  setAutoSync,
} from "@/lib/anilist-sync";
import type { SettingsSection } from "@/lib/settings-modal";
import { LIST_STATUSES, type LibraryState } from "@/lib/state";
import {
  ACCENTS,
  clearHistory,
  exportState,
  getLists,
  getPrefs,
  importState,
  resetPrefs,
  setPrefs,
  setProfile,
  type Prefs,
} from "@/lib/storage";
import { logout, syncNow, useAccount } from "@/lib/sync";

const NAV: { group: string; items: { id: SettingsSection; label: string; icon: string }[] }[] = [
  {
    group: "Your account",
    items: [
      { id: "profile", label: "Profile & privacy", icon: "user" },
      { id: "connections", label: "Connected accounts", icon: "layers" },
      { id: "data", label: "Data management", icon: "library" },
    ],
  },
  {
    group: "Preferences",
    items: [
      { id: "browsing", label: "Browsing", icon: "gear" },
      { id: "appearance", label: "Appearance", icon: "image" },
      { id: "language", label: "Language", icon: "cc" },
      { id: "watching", label: "Watching", icon: "play" },
      { id: "history", label: "History & progress", icon: "rewatch" },
    ],
  },
  {
    group: "Shortcuts",
    items: [
      { id: "keys-general", label: "General", icon: "grid" },
      { id: "keys-watching", label: "Watching", icon: "list" },
      { id: "keys-player", label: "Player", icon: "monitor" },
    ],
  },
];
const TITLES = Object.fromEntries(NAV.flatMap((g) => g.items.map((i) => [i.id, i.label]))) as Record<SettingsSection, string>;
const TITLE_OVERRIDES: Partial<Record<SettingsSection, string>> = {
  "keys-general": "General shortcuts",
  "keys-watching": "Watching shortcuts",
  "keys-player": "Player shortcuts",
};
const ALL_SECTIONS = Object.keys(TITLES) as SettingsSection[];

function ago(t: number) {
  if (!t) return "never";
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`;
}

function download(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

// --- Building blocks ---------------------------------------------------------

/** The settings search; rows that don't match hide themselves. */
const SearchContext = createContext("");
/** Switches the panel to another section. */
const OpenContext = createContext<(id: SettingsSection) => void>(() => {});

function Group({ title, desc, children }: { title?: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="sgroup">
      <div className="sgroup__card">
        {title ? (
          <div className="sgroup__head">
            <strong>{title}</strong>
            {desc ? <span>{desc}</span> : null}
          </div>
        ) : null}
        {children}
      </div>
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
            <span className="srow__where" title={where === "device" ? "This device only" : "Synced with your account"}>
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

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="sseg" role="radiogroup">
      {options.map(([v, label]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? "is-active" : ""} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
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

// --- Panel -----------------------------------------------------------------------

export default function SettingsPanel({
  initial = "profile",
  onClose,
  modal,
}: {
  initial?: SettingsSection;
  onClose: () => void;
  modal?: boolean;
}) {
  const { user, display } = useAccount();
  const profile = useProfile();
  const [section, setSection] = useState<SettingsSection>(initial);
  const [q, setQ] = useState("");
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSection(initial), [initial]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === "Escape" && tag !== "INPUT" && tag !== "SELECT" && tag !== "TEXTAREA") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function open(id: SettingsSection) {
    setSection(id);
    setQ("");
    mainRef.current?.scrollTo({ top: 0 });
    if (!modal) window.history.replaceState(null, "", `#${id}`);
  }

  const name = display ?? profile.anilist?.name ?? user ?? "…";
  const searching = q.trim().length > 0;
  const shown = searching ? ALL_SECTIONS : [section];

  return (
    <div className={`sset ${modal ? "sset--modal" : ""}`} role={modal ? "dialog" : undefined} aria-modal={modal || undefined} aria-label="Settings">
      <aside className="sset__nav">
        <div className="sset__me">
          <Avatar src={profile.avatar} name={name} size={30} />
          <strong>{name}</strong>
        </div>
        <label className="sset__search">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search settings" autoFocus={modal} />
        </label>
        {NAV.map((g) => (
          <nav key={g.group} className="sset__group">
            <span>{g.group}</span>
            {g.items.map((it) => (
              <button key={it.id} className={!searching && section === it.id ? "is-active" : ""} onClick={() => open(it.id)}>
                <Icon name={it.icon} size={15} />
                {it.label}
              </button>
            ))}
          </nav>
        ))}
      </aside>

      <div className="sset__main" ref={mainRef}>
        <button className="sset__close" onClick={onClose} aria-label="Close settings">
          <Icon name="close" size={18} />
          <span>ESC</span>
        </button>
        <OpenContext.Provider value={open}>
        <SearchContext.Provider value={q}>
          {shown.map((id) => (
            <div key={id} className="sset__section">
              <h1>{TITLE_OVERRIDES[id] ?? TITLES[id]}</h1>
              {!id.startsWith("keys-") ? (
                <p className="sset__saved">
                  <Icon name={user ? "cloud" : "monitor"} size={13} />
                  {user ? "All changes saved to your account" : "All changes saved on this device"}
                </p>
              ) : null}
              {id === "profile" ? <ProfileSection /> : null}
              {id === "connections" ? <ConnectionsSection /> : null}
              {id === "data" ? <DataSection /> : null}
              {id === "browsing" ? <BrowsingSection /> : null}
              {id === "appearance" ? <AppearanceSection /> : null}
              {id === "language" ? <LanguageSection /> : null}
              {id === "watching" ? <WatchingSection /> : null}
              {id === "history" ? <HistorySection /> : null}
              {id.startsWith("keys-") ? <ShortcutsSection which={id} /> : null}
            </div>
          ))}
        </SearchContext.Provider>
        </OpenContext.Provider>
      </div>
      <span className="sset__ver">Mayoi</span>
    </div>
  );
}

// --- Account ---------------------------------------------------------------------

function ProfileSection() {
  const profile = useProfile();
  const { user, display, createdAt } = useAccount();
  const [editAvatar, setEditAvatar] = useState(false);
  const [url, setUrl] = useState("");
  useEffect(() => setUrl(profile.avatar ?? ""), [profile.avatar]);
  const shownName = display ?? profile.anilist?.name ?? user ?? "…";

  return (
    <>
      <Group title="Account info">
        <Row title="Member since" desc={createdAt ? new Date(createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"} />
        <Row title="AniList account" desc={`Signed in as ${shownName}. Your Mayoi account is your AniList account.`} where="account" />
        <Row title="Profile picture" desc={profile.avatar ? (profile.avatar === profile.anilist?.avatar ? "From AniList" : "Custom image") : "Your initial"} where="account">
          <Avatar src={profile.avatar} name={shownName} size={36} />
          <button className="sbtn" onClick={() => setEditAvatar(!editAvatar)}>
            Edit
          </button>
        </Row>
        {editAvatar ? (
          <div className="srow srow--wide">
            <form
              className="sinline"
              onSubmit={(e) => {
                e.preventDefault();
                setProfile({ avatar: url.trim() || null });
                setEditAvatar(false);
              }}
            >
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Image link, e.g. https://…/avatar.png" type="url" autoFocus />
              <button className="sbtn sbtn--primary">Save</button>
              {profile.anilist?.avatar ? (
                <button type="button" className="sbtn" onClick={() => (setProfile({ avatar: profile.anilist!.avatar }), setEditAvatar(false))}>
                  Use AniList
                </button>
              ) : null}
              {profile.avatar ? (
                <button type="button" className="sbtn" onClick={() => (setProfile({ avatar: null }), setEditAvatar(false))}>
                  Remove
                </button>
              ) : null}
            </form>
          </div>
        ) : null}
      </Group>

      <Group title="Security">
        <Row title="Sign out" desc="Sign out on this device. Signing back in with AniList brings everything back.">
          <button className="sbtn" onClick={() => logout()}>
            Sign out
          </button>
        </Row>
      </Group>
    </>
  );
}

function ConnectionsSection() {
  const profile = useProfile();
  const link = profile.anilist && profile.anilist.expiresAt > Date.now() ? profile.anilist : null;
  const [state, setState] = useState<{ busy?: boolean; error?: string; done?: string }>({});

  async function sync() {
    setState({ busy: true });
    try {
      setState({ done: `Pulled ${(await pullFromAniList())?.total ?? 0} entries from AniList.` });
    } catch (e) {
      setState({ error: (e as Error).message });
    }
  }

  return (
    <Group title="AniList" desc="Your Mayoi account and your AniList list stay in step.">
      {link ? (
        <>
          <Row title={`Connected as ${link.name}`} desc={`Two-way sync · last pulled ${ago(lastPull())}`} where="account">
            <Avatar src={link.avatar} name={link.name} size={30} />
            <button className="sbtn" disabled={state.busy} onClick={sync}>
              {state.busy ? "Syncing…" : "Sync now"}
            </button>
          </Row>
          <Row title="Update AniList as I watch" desc="Finishing an episode or changing a list here updates your AniList too." where="account">
            <Switch checked={link.autoSync} onChange={setAutoSync} label="Update AniList as I watch" />
          </Row>
        </>
      ) : (
        <Row
          title={profile.anilist ? "AniList login expired" : "Reconnect AniList"}
          desc="Sign in with AniList again on this device to keep your list syncing."
        >
          <a
            className="sbtn sbtn--primary"
            href={ANILIST_CLIENT_ID ? connectUrl() : "#"}
            onClick={() => {
              try {
                sessionStorage.setItem("as:after-login", window.location.pathname + window.location.search);
              } catch {}
            }}
          >
            Reconnect
          </a>
        </Row>
      )}
      {state.error || state.done ? (
        <div className="srow srow--msg">{state.error ? <p className="form__error">{state.error}</p> : <p className="form__ok">{state.done}</p>}</div>
      ) : null}
    </Group>
  );
}

// --- Data ------------------------------------------------------------------------

const MAL_STATUS: Record<string, string> = {
  CURRENT: "Watching",
  REPEATING: "Watching",
  COMPLETED: "Completed",
  PAUSED: "On-Hold",
  DROPPED: "Dropped",
  PLANNING: "Plan to Watch",
};

async function malIds(ids: number[]): Promise<Record<number, number>> {
  const out: Record<number, number> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const r = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        query: "query ($ids: [Int]) { Page(perPage: 50) { media(id_in: $ids, type: ANIME) { id idMal } } }",
        variables: { ids: ids.slice(i, i + 50) },
      }),
    });
    const json = (await r.json()) as { data?: { Page: { media: { id: number; idMal: number | null }[] } } };
    for (const m of json.data?.Page.media ?? []) if (m.idMal) out[m.id] = m.idMal;
  }
  return out;
}

const xml = (s: string) => s.replace(/]]>/g, "]]]]><![CDATA[>");

function DataSection() {
  const openSection = useContext(OpenContext);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [backup, setBackup] = useState<Partial<LibraryState> | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  async function exportMal() {
    setBusy("mal");
    try {
      const lists = Object.values(getLists());
      const ids = await malIds(lists.map((l) => l.id));
      const rows = lists
        .filter((l) => ids[l.id])
        .map(
          (l) => `  <anime>
    <series_animedb_id>${ids[l.id]}</series_animedb_id>
    <series_title><![CDATA[${xml(l.title)}]]></series_title>
    <series_episodes>${l.episodes ?? 0}</series_episodes>
    <my_watched_episodes>${l.progress}</my_watched_episodes>
    <my_score>${Math.round(l.score / 10)}</my_score>
    <my_status>${MAL_STATUS[l.status]}</my_status>
    <my_times_watched>${l.status === "REPEATING" ? 1 : 0}</my_times_watched>
    <update_on_import>1</update_on_import>
  </anime>`,
        );
      download(
        `mayoi-mal-${today}.xml`,
        `<?xml version="1.0" encoding="UTF-8"?>\n<myanimelist>\n  <myinfo><user_export_type>1</user_export_type></myinfo>\n${rows.join("\n")}\n</myanimelist>\n`,
        "application/xml",
      );
      setMsg({ ok: `Exported ${rows.length} of ${lists.length} shows (the rest have no MyAnimeList ID).` });
    } catch {
      setMsg({ error: "Couldn't reach AniList to look up MyAnimeList IDs." });
    }
    setBusy(null);
  }

  function exportAniList() {
    const lists = Object.values(getLists());
    const byStatus = LIST_STATUSES.map((s) => ({
      name: s.label,
      status: s.id,
      entries: lists.filter((l) => l.status === s.id).map((l) => ({ mediaId: l.id, title: l.title, progress: l.progress, score: l.score })),
    })).filter((g) => g.entries.length);
    download(`mayoi-anilist-${today}.json`, JSON.stringify({ lists: byStatus }, null, 2), "application/json");
    setMsg({ ok: `Exported ${lists.length} shows with their AniList IDs.` });
  }

  async function readBackup(file: File | undefined) {
    setBackup(null);
    setMsg(null);
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as Partial<LibraryState>;
      if (!data || typeof data !== "object" || !("lists" in data || "history" in data || "watchlist" in data)) throw new Error();
      setBackup(data);
    } catch {
      setMsg({ error: "That isn't a Mayoi backup file." });
    }
  }

  return (
    <>
      <Group title="History and settings">
        <Row title="Clear watch history" desc="Removes everything from Continue Watching and forgets playback positions. Your lists stay unchanged." where="account">
          <button
            className="sbtn sbtn--danger"
            onClick={() => {
              if (confirm("Clear your whole watch history? Your lists stay as they are.")) {
                clearHistory();
                setMsg({ ok: "Watch history cleared." });
              }
            }}
          >
            Clear
          </button>
        </Row>
        <Row title="Restore default settings" desc="Puts playback, appearance and browsing settings back to their defaults. Lists and history stay unchanged." where="device">
          <button
            className="sbtn sbtn--danger"
            onClick={() => {
              if (confirm("Restore all settings to their defaults?")) {
                resetPrefs();
                setMsg({ ok: "Settings restored to defaults." });
              }
            }}
          >
            Restore
          </button>
        </Row>
      </Group>

      <Group title="Export" desc="Save a backup, or export your lists for AniList or MyAnimeList.">
        <Row title="Mayoi backup" desc="Lists, favourites, custom lists, history and exact playback positions.">
          <button className="sbtn" onClick={() => download(`mayoi-backup-${today}.json`, JSON.stringify(exportState(), null, 2), "application/json")}>
            <Icon name="download" size={14} /> Export JSON
          </button>
        </Row>
        <Row title="MyAnimeList XML" desc="List entries that have a MyAnimeList ID, ready for MAL's import page.">
          <button className="sbtn" disabled={busy === "mal"} onClick={exportMal}>
            <Icon name="download" size={14} /> {busy === "mal" ? "Exporting…" : "Export MAL XML"}
          </button>
        </Row>
        <Row title="AniList JSON" desc="List entries with their AniList IDs, progress and scores.">
          <button className="sbtn" onClick={exportAniList}>
            <Icon name="download" size={14} /> Export AniList JSON
          </button>
        </Row>
      </Group>

      <Group title="Import" desc="Restore a Mayoi backup. Entries are merged; whichever copy is newer wins.">
        <Row title="Backup file" wide>
          <label className="sfile">
            <input type="file" accept="application/json,.json" onChange={(e) => readBackup(e.target.files?.[0])} />
          </label>
          {backup ? (
            <div className="sfile__preview">
              <span>
                {Object.keys(backup.lists ?? {}).length} list entries · {backup.history?.length ?? 0} history · {Object.values(backup.favorites ?? {}).filter((f) => f.on).length} favourites ·{" "}
                {Object.values(backup.customLists ?? {}).filter((c) => !c.deleted).length} custom lists
              </span>
              <button
                className="sbtn sbtn--primary"
                onClick={() => {
                  importState(backup, true);
                  setBackup(null);
                  setMsg({ ok: "Backup imported." });
                }}
              >
                Import
              </button>
            </div>
          ) : null}
        </Row>
        <Row title="From AniList" desc="Your AniList list comes in automatically. Sync it any time under Connected accounts.">
          <button className="sbtn" onClick={() => openSection("connections")}>
            Connected accounts
          </button>
        </Row>
      </Group>
      {msg ? <p className={msg.error ? "form__error" : "form__ok"}>{msg.error ?? msg.ok}</p> : null}
    </>
  );
}

// --- Preferences -------------------------------------------------------------------

function BrowsingSection() {
  const [prefs, update] = usePrefs();
  if (!prefs) return null;
  return (
    <Group>
      <Row title="Hide spoilers" desc="Blur stills and hide descriptions of episodes you haven't reached yet." where="device">
        <Switch checked={prefs.hideSpoilers} onChange={(v) => update({ hideSpoilers: v })} label="Hide spoilers" />
      </Row>
      <Row title="Open anime on" desc="Where clicking an anime card takes you: its info page, or straight to watching." where="device">
        <Segmented value={prefs.openOn} options={[["info", "Info"], ["watch", "Watch"]]} onChange={(v) => update({ openOn: v })} />
      </Row>
    </Group>
  );
}

function AppearanceSection() {
  const [prefs, update] = usePrefs();
  if (!prefs) return null;
  return (
    <Group>
      <Row title="Theme" desc="Dark, or pitch black for OLED screens." where="device">
        <select className="sselect" value={prefs.theme} onChange={(e) => update({ theme: e.target.value as Prefs["theme"] })}>
          <option value="dark">Dark</option>
          <option value="black">Black (OLED)</option>
        </select>
      </Row>
      <Row title="Accent colour" desc="Used for buttons, highlights and progress bars." where="device">
        <div className="saccent">
          <select className="sselect" value={prefs.accent} onChange={(e) => update({ accent: e.target.value })}>
            {Object.entries(ACCENTS).map(([id, a]) => (
              <option key={id} value={id}>
                {a.label}
              </option>
            ))}
          </select>
          <span className="saccent__swatch" style={{ background: `linear-gradient(90deg, ${ACCENTS[prefs.accent]?.colors[0]}, ${ACCENTS[prefs.accent]?.colors[1]})` }} />
        </div>
      </Row>
      <Row title="Corner roundness" desc="How rounded cards, panels and the player are." where="device">
        <div className="srange">
          <input type="range" min={0} max={100} step={10} value={prefs.radius} onChange={(e) => update({ radius: Number(e.target.value) })} aria-label="Corner roundness" />
          <span>{prefs.radius}%</span>
        </div>
      </Row>
      <Row title="Card size" desc="Poster size on the home and search pages." where="device">
        <Segmented value={prefs.cardSize} options={[["medium", "Medium"], ["large", "Large"]]} onChange={(v) => update({ cardSize: v })} />
      </Row>
    </Group>
  );
}

function LanguageSection() {
  const [prefs, update] = usePrefs();
  if (!prefs) return null;
  return (
    <Group>
      <Row title="Default audio" desc="Which audio to try first when you start watching." where="device">
        <Segmented value={prefs.audio ?? "sub"} options={[["sub", "Subtitled"], ["dub", "Dubbed"]]} onChange={(v) => update({ audio: v })} />
      </Row>
      <Row title="Subtitle style" desc="Size, colours, outline and timing are set from the Aa button on the video." where="device" />
    </Group>
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
        <Row title="Auto play" desc="Start playing when an episode opens." where="device">
          <Switch checked={prefs.autoStart} onChange={(v) => update({ autoStart: v })} label="Auto play" />
        </Row>
        <Row title="Auto skip" desc="Skip detected openings and endings." where="device">
          <Switch checked={prefs.autoSkip} onChange={(v) => update({ autoSkip: v })} label="Auto skip" />
        </Row>
        <Row title="Auto next episode" desc="Continue to the next episode when one ends." where="device">
          <Switch checked={prefs.autoplay} onChange={(v) => update({ autoplay: v })} label="Auto next episode" />
        </Row>
      </Group>
      <Group title="Watch page">
        <Row title="Episode list layout" desc="The default layout for episode lists. Auto uses the grid for long shows." where="device">
          <select className="sselect" value={prefs.episodeLayout} onChange={(e) => update({ episodeLayout: e.target.value as Prefs["episodeLayout"] })}>
            <option value="auto">Auto</option>
            <option value="list">Detailed list</option>
            <option value="grid">Grid</option>
          </select>
        </Row>
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
          <Segmented value={prefs.homeHistory ? "show" : "hide"} options={[["hide", "Hide"], ["show", "Show"]]} onChange={(v) => update({ homeHistory: v === "show" })} />
        </Row>
        <Row title="History page" desc="Review or remove entries in My List → Continue watching." where="account">
          <Link className="sbtn" href="/library?view=history">
            <Icon name="rewatch" size={14} /> Manage history
          </Link>
        </Row>
      </Group>
      <Group title="Watchlist progress">
        <Row
          title="Auto sync"
          desc='Save episode progress to your list for shows set to "Watching" or "Re-watching". With AniList connected, the change goes to AniList too.'
          where="device"
        >
          <Switch checked={prefs.autoSyncList} onChange={(v) => update({ autoSyncList: v })} label="Auto sync" />
        </Row>
        <Row title="Sync threshold" desc="How much of an episode to watch before progress updates. The default is 80%." where="device">
          <div className="srange">
            <input type="range" min={50} max={100} step={5} value={pct} onChange={(e) => update({ syncThreshold: Number(e.target.value) / 100 })} aria-label="Sync threshold" />
            <span>{pct}%</span>
          </div>
        </Row>
      </Group>
    </>
  );
}

const SHORTCUTS: Record<string, [string, string][]> = {
  "keys-general": [
    ["/", "Focus the search bar"],
    ["Esc", "Close menus, pop-ups and settings"],
    ["← / →", "Previous / next slide on the home banner"],
  ],
  "keys-watching": [
    ["N", "Next episode"],
    ["S", "Skip intro or outro"],
  ],
  "keys-player": [
    ["Space / K", "Play or pause"],
    ["← / →", "Back / forward 10 seconds"],
    ["↑ / ↓", "Volume up / down"],
    ["M", "Mute"],
    ["F", "Fullscreen"],
    ["C", "Subtitles on / off"],
  ],
};

function ShortcutsSection({ which }: { which: string }) {
  return (
    <Group>
      {(SHORTCUTS[which] ?? []).map(([keys, what]) => (
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
