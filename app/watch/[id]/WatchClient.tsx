"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Menu, { Icon, MenuItem } from "@/components/Menu";
import Player from "@/components/Player";
import type { EpisodeMeta } from "@/lib/extras";
import type { ProviderEpisodes } from "@/lib/sources";
import type { EpisodeInfo, Stream } from "@/lib/sources/types";
import {
  getHistory,
  getLists,
  getPosition,
  getPrefs,
  isWatched,
  saveProgress,
  setPrefs,
  STORAGE_EVENT,
  type Audio,
  type SavedAnime,
} from "@/lib/storage";

export type Season = { id: number; title: string; cover: string | null; label: string; current?: boolean };

type Props = {
  anime: SavedAnime & { banner: string | null };
  providers: ProviderEpisodes[];
  meta: Record<number, EpisodeMeta>;
  seasons: Season[];
  initialEp: number | null;
  initialSource: string | null;
  initialAudio: Audio | null;
};

const CHUNK = 100;

function formatDate(d?: string) {
  if (!d) return "";
  const date = new Date(d);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function WatchClient({ anime, providers, meta, seasons, initialEp, initialSource, initialAudio }: Props) {
  const [mounted, setMounted] = useState(false);
  const [sourceId, setSourceId] = useState(
    providers.find((p) => p.id === initialSource)?.id ?? providers[0].id,
  );
  const [audio, setAudio] = useState<Audio>(initialAudio ?? "sub");
  const [ep, setEp] = useState<number>(initialEp ?? providers[0].episodes[0].number);
  const [stream, setStream] = useState<Stream | null>(null);
  const [startAt, setStartAt] = useState<number | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefsState] = useState({ autoplay: true, autoStart: true, autoSkip: false, hideSpoilers: true });
  const [filter, setFilter] = useState("");
  const [chunk, setChunk] = useState(0);
  const [desc, setDesc] = useState(false);
  const [view, setView] = useState<"list" | "grid">("list");
  const [, bump] = useState(0);
  const activeRef = useRef<HTMLButtonElement>(null);

  const provider = providers.find((p) => p.id === sourceId) ?? providers[0];
  const episodes = provider.episodes;
  const idx = episodes.findIndex((e) => e.number === ep);
  const current = episodes[idx];
  const prev = idx > 0 ? episodes[idx - 1] : null;
  const next = idx >= 0 && idx < episodes.length - 1 ? episodes[idx + 1] : null;
  const hasAudio = (p: ProviderEpisodes, a: Audio) => p.audio.includes(a);
  const dubAnywhere = providers.some((p) => hasAudio(p, "dub"));

  // On first mount: restore prefs, preferred server/audio and last-watched episode.
  useEffect(() => {
    const p = getPrefs();
    setPrefsState({ autoplay: p.autoplay, autoStart: p.autoStart, autoSkip: p.autoSkip, hideSpoilers: p.hideSpoilers });
    const a = initialAudio ?? p.audio ?? "sub";
    setAudio(a);
    // This show's own server choice first, then the preferred server from Settings.
    if (!initialSource) {
      const wanted = [p.sourceFor[anime.id], p.preferredSource].filter(Boolean);
      const saved = wanted.map((id) => providers.find((x) => x.id === id && hasAudio(x, a))).find(Boolean);
      if (saved) setSourceId(saved.id);
    }
    if (!initialEp) {
      const h = getHistory().find((x) => x.id === anime.id);
      if (h) setEp(h.episode);
    }
    if (p.episodeLayout === "grid" || (p.episodeLayout === "auto" && providers[0].episodes.length > CHUNK)) setView("grid");
    setMounted(true);
    const sync = () => bump((n) => n + 1);
    window.addEventListener(STORAGE_EVENT, sync);
    return () => window.removeEventListener(STORAGE_EVENT, sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the selected episode inside the current server's list.
  useEffect(() => {
    if (episodes.length && !episodes.some((e) => e.number === ep)) setEp(episodes[0].number);
  }, [episodes, ep]);

  // Keep the visible episode range on the current episode.
  useEffect(() => {
    if (idx >= 0) setChunk(Math.floor(idx / CHUNK));
  }, [idx]);

  // Scroll the episode list (only the list, never the page) to the current episode.
  useEffect(() => {
    const el = activeRef.current;
    const list = el?.closest(".episodes__list") as HTMLElement | null;
    if (!el || !list) return;
    const top = el.offsetTop - list.offsetTop;
    if (top < list.scrollTop || top + el.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTo({ top: top - list.clientHeight / 2 + el.offsetHeight / 2, behavior: mounted ? "smooth" : "auto" });
    }
  }, [ep, mounted, view]);

  // Load the stream whenever episode, server or audio changes.
  useEffect(() => {
    if (!mounted || !current) return;
    const url = `/watch/${anime.id}?ep=${ep}&source=${sourceId}${audio === "dub" ? "&audio=dub" : ""}`;
    window.history.replaceState(window.history.state, "", url);

    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    setStream(null);
    setStartAt(getPosition(anime.id, ep)?.t);
    fetch(`/api/stream?id=${anime.id}&ep=${ep}&source=${encodeURIComponent(sourceId)}&audio=${audio}`, {
      signal: ctrl.signal,
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Could not load stream");
        setStream(data as Stream);
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [mounted, anime.id, ep, sourceId, audio, current]);

  function updatePrefs(p: Partial<typeof prefs>) {
    setPrefsState((s) => ({ ...s, ...p }));
    setPrefs(p);
  }

  function pickSource(id: string) {
    setSourceId(id);
    setPrefs({ sourceFor: { ...getPrefs().sourceFor, [anime.id]: id } });
  }

  function pickAudio(a: Audio) {
    setAudio(a);
    setPrefs({ audio: a });
    // Switch to a server that has this audio, if the current one doesn't.
    if (!hasAudio(provider, a)) {
      const alt = providers.find((p) => hasAudio(p, a) && p.episodes.some((e) => e.number === ep));
      if (alt) setSourceId(alt.id);
    }
  }

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase();
    let list: EpisodeInfo[];
    if (f) {
      list = episodes.filter((e) => {
        const t = (meta[e.number]?.title ?? e.title ?? "").toLowerCase();
        return String(e.number).startsWith(f) || t.includes(f);
      });
    } else list = episodes.slice(chunk * CHUNK, chunk * CHUNK + CHUNK);
    return desc ? [...list].reverse() : list;
  }, [episodes, filter, chunk, desc, meta]);

  // Episodes past what the viewer has reached get their stills and synopses hidden.
  const listProgress = mounted ? getLists()[anime.id]?.progress ?? 0 : 0;
  const reached = Math.max(ep, listProgress);
  const isSpoiler = (n: number) => prefs.hideSpoilers && n > reached;

  const currentMeta = meta[ep];
  const epTitle = currentMeta?.title ?? (current?.title && current.title !== `Episode ${ep}` ? current.title : null);
  const otherServers = providers.filter(
    (p) => p.id !== sourceId && hasAudio(p, audio) && p.episodes.some((e) => e.number === ep),
  );

  return (
    <div className="watch container">
      <div className="watch__crumbs">
        <Link href="/">Home</Link> / <Link href={`/anime/${anime.id}`}>{anime.title}</Link> / Episode {ep}
      </div>

      <div className="watch__layout">
        <div className="watch__main">
          {stream ? (
            <Player
              stream={stream}
              poster={currentMeta?.image ?? current?.thumbnail ?? anime.banner ?? undefined}
              startAt={startAt}
              autoSkip={prefs.autoSkip}
              autoplayNext={prefs.autoplay}
              autoStart={prefs.autoStart}
              hasNext={!!next}
              onNext={() => next && setEp(next.number)}
              onProgress={(time, duration) =>
                saveProgress({
                  id: anime.id,
                  title: anime.title,
                  cover: anime.cover,
                  format: anime.format,
                  episodes: anime.episodes,
                  episode: ep,
                  time,
                  duration,
                })
              }
            />
          ) : (
            <div
              className="player player--placeholder player--poster"
              style={{
                backgroundImage: (currentMeta?.image ?? current?.thumbnail ?? anime.banner)
                  ? `url(${currentMeta?.image ?? current?.thumbnail ?? anime.banner})`
                  : undefined,
              }}
            >
              {loading ? (
                <span className="player__bigplay is-loading" aria-label="Loading">
                  <Icon name="play" size={30} />
                </span>
              ) : null}
              {error ? (
                <div className="player__error">
                  {error}
                  {otherServers.length ? (
                    <div>
                      <button className="btn btn--sm" onClick={() => pickSource(otherServers[0].id)}>
                        Try {otherServers[0].name}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}

          <div className="watch__bar">
            <div className="watch__title">
              <div className="watch__sub">
                Episode {ep}
                {currentMeta?.airDate ? ` · ${formatDate(currentMeta.airDate)}` : ""}
                {current?.filler ? <em className="chip chip--warn">Filler</em> : null}
              </div>
              <h1>{epTitle ?? anime.title}</h1>
              {epTitle ? (
                <Link className="watch__show" href={`/anime/${anime.id}`}>
                  {anime.title}
                </Link>
              ) : null}
            </div>

            <div className="watch__actions">
              <button className="icon-btn" disabled={!prev} onClick={() => prev && setEp(prev.number)} title="Previous episode">
                <Icon name="prev" />
              </button>
              <button className="icon-btn" disabled={!next} onClick={() => next && setEp(next.number)} title="Next episode">
                <Icon name="next" />
              </button>

              <Menu
                up
                align="right"
                heading="Audio"
                label={
                  <>
                    <Icon name={audio === "dub" ? "mic" : "cc"} />
                    {audio === "dub" ? "Dub" : "Sub"}
                    <Icon name="chevron" size={14} />
                  </>
                }
              >
                {(close) => (
                  <>
                    <MenuItem icon={<Icon name="cc" />} active={audio === "sub"} onClick={() => (pickAudio("sub"), close())}>
                      Sub
                    </MenuItem>
                    <MenuItem
                      icon={<Icon name="mic" />}
                      active={audio === "dub"}
                      disabled={!dubAnywhere}
                      title={dubAnywhere ? "" : "No dub on any server yet"}
                      onClick={() => (pickAudio("dub"), close())}
                    >
                      Dub
                    </MenuItem>
                  </>
                )}
              </Menu>

              <Menu
                up
                align="right"
                heading="Provider"
                className="menu--wide"
                label={
                  <>
                    <Icon name="bolt" />
                    {provider.name}
                    <Icon name="chevron" size={14} />
                  </>
                }
              >
                {(close) =>
                  providers.map((p) => {
                    const hasEp = p.episodes.some((e) => e.number === ep);
                    const ok = hasEp && hasAudio(p, audio);
                    return (
                      <MenuItem
                        key={p.id}
                        icon={<Icon name="bolt" />}
                        active={p.id === sourceId}
                        disabled={!ok}
                        title={!hasEp ? "Episode not on this server" : ok ? "" : `No ${audio} on this server`}
                        onClick={() => (pickSource(p.id), close())}
                        extra={
                          <>
                            {p.tags.map((t) => (
                              <span key={t} className={`tag tag--${t.replace(/[^a-z]/gi, "")}`}>
                                {t}
                              </span>
                            ))}
                            {p.audio.includes("dub") ? <span className="tag tag--dub">dub</span> : null}
                          </>
                        }
                      >
                        {p.name}
                      </MenuItem>
                    );
                  })
                }
              </Menu>

              <Menu up align="right" heading="Playback" label={<Icon name="dots" />} className="menu--icon">
                {() => (
                  <>
                    <label className="menu__toggle">
                      Autoplay next
                      <input type="checkbox" checked={prefs.autoplay} onChange={(e) => updatePrefs({ autoplay: e.target.checked })} />
                    </label>
                    <label className="menu__toggle">
                      Auto-skip intro/outro
                      <input type="checkbox" checked={prefs.autoSkip} onChange={(e) => updatePrefs({ autoSkip: e.target.checked })} />
                    </label>
                    <label className="menu__toggle">
                      Hide spoilers
                      <input
                        type="checkbox"
                        checked={prefs.hideSpoilers}
                        onChange={(e) => updatePrefs({ hideSpoilers: e.target.checked })}
                      />
                    </label>
                  </>
                )}
              </Menu>
            </div>
          </div>

          {currentMeta?.overview && !isSpoiler(ep) ? <p className="watch__overview">{currentMeta.overview}</p> : null}
        </div>

        <aside className="side">
          <div className="episodes">
            <div className="episodes__head">
              <h2 title={anime.title}>{anime.title}</h2>
              <span className="muted episodes__count">
                {idx + 1}/{episodes.length}
              </span>
              <button className="icon-btn icon-btn--ghost" onClick={() => setDesc((d) => !d)} title="Reverse order">
                <Icon name="sort" />
              </button>
              <button
                className={`icon-btn icon-btn--ghost ${prefs.hideSpoilers ? "is-on" : ""}`}
                onClick={() => updatePrefs({ hideSpoilers: !prefs.hideSpoilers })}
                title={prefs.hideSpoilers ? "Show spoilers" : "Hide spoilers"}
              >
                <Icon name={prefs.hideSpoilers ? "eyeOff" : "eye"} />
              </button>
              <button
                className="icon-btn icon-btn--ghost"
                onClick={() => setView((v) => (v === "list" ? "grid" : "list"))}
                title={view === "list" ? "Number grid" : "Detailed list"}
              >
                <Icon name={view === "list" ? "grid" : "list"} />
              </button>
            </div>
            {episodes.length > 24 ? (
              <input
                className="episodes__filter"
                placeholder="Find episode…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            ) : null}
            {episodes.length > CHUNK && !filter ? (
              <select className="episodes__range" value={chunk} onChange={(e) => setChunk(Number(e.target.value))}>
                {Array.from({ length: Math.ceil(episodes.length / CHUNK) }, (_, i) => (
                  <option key={i} value={i}>
                    {episodes[i * CHUNK].number}–{episodes[Math.min(episodes.length, (i + 1) * CHUNK) - 1].number}
                  </option>
                ))}
              </select>
            ) : null}

            <div className={`episodes__list ${view === "grid" ? "episodes__list--grid" : ""}`}>
              {visible.map((e) => {
                const pos = mounted ? getPosition(anime.id, e.number) : null;
                const watched = (pos ? isWatched(pos.t, pos.d) : false) || e.number <= listProgress;
                const m = meta[e.number];
                const title = m?.title ?? e.title ?? `Episode ${e.number}`;
                const active = e.number === ep;
                const progress = pos && pos.d && !watched ? (
                  <span className="ep__progress" style={{ width: `${(pos.t / pos.d) * 100}%` }} />
                ) : null;

                if (view === "grid") {
                  return (
                    <button
                      key={e.number}
                      ref={active ? activeRef : undefined}
                      className={`ep ${active ? "is-active" : ""} ${watched ? "is-watched" : ""} ${e.filler ? "is-filler" : ""}`}
                      onClick={() => setEp(e.number)}
                      title={isSpoiler(e.number) ? `Episode ${e.number}` : title}
                    >
                      <span className="ep__num">{e.number}</span>
                      {progress}
                    </button>
                  );
                }

                const spoiler = isSpoiler(e.number);
                const img = m?.image ?? e.thumbnail ?? anime.banner ?? anime.cover;
                return (
                  <button
                    key={e.number}
                    ref={active ? activeRef : undefined}
                    className={`epc ${active ? "is-active" : ""} ${watched ? "is-watched" : ""} ${e.filler ? "is-filler" : ""}`}
                    onClick={() => setEp(e.number)}
                  >
                    <span className={`epc__thumb ${spoiler ? "is-hidden" : ""}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {img ? <img src={img} alt="" loading="lazy" /> : null}
                      {spoiler ? <span className="epc__spoiler">Hidden spoiler</span> : null}
                      <span className="epc__num">EP {e.number}</span>
                      {progress}
                    </span>
                    <span className="epc__body">
                      <span className="epc__title">{title}</span>
                      <span className="epc__desc">{spoiler ? "Hidden description" : m?.overview ?? ""}</span>
                      <span className="epc__foot">
                        <span className="epc__audio">
                          <Icon name="cc" size={13} />
                          {e.dub || provider.audio.includes("dub") ? <Icon name="mic" size={13} /> : null}
                          {e.filler ? <em>Filler</em> : null}
                        </span>
                        <span>{formatDate(m?.airDate)}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {seasons.length > 1 ? (
            <div className="seasons">
              <h2>
                <Icon name="layers" size={18} /> Seasons
              </h2>
              <div className="seasons__list">
                {seasons.map((s) => (
                  <Link
                    key={s.id}
                    href={`/watch/${s.id}`}
                    className={`season ${s.current ? "is-active" : ""}`}
                    style={{ backgroundImage: s.cover ? `url(${s.cover})` : undefined }}
                  >
                    <span className="season__label">{s.label}</span>
                    <span className="season__title">{s.title}</span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
