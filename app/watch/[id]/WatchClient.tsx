"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Player from "@/components/Player";
import type { ProviderEpisodes } from "@/lib/sources";
import type { Stream } from "@/lib/sources/types";
import { getHistory, getPosition, getPrefs, saveProgress, setPrefs, STORAGE_EVENT, type SavedAnime } from "@/lib/storage";

type Props = {
  anime: SavedAnime & { banner: string | null };
  providers: ProviderEpisodes[];
  initialEp: number | null;
  initialSource: string | null;
};

const CHUNK = 100;

export default function WatchClient({ anime, providers, initialEp, initialSource }: Props) {
  const [mounted, setMounted] = useState(false);
  const [sourceId, setSourceId] = useState(
    providers.find((p) => p.id === initialSource)?.id ?? providers[0].id,
  );
  const [ep, setEp] = useState<number>(initialEp ?? providers[0].episodes[0].number);
  const [stream, setStream] = useState<Stream | null>(null);
  const [startAt, setStartAt] = useState<number | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefsState] = useState({ autoplay: true, autoSkip: false });
  const [filter, setFilter] = useState("");
  const [chunk, setChunk] = useState(0);
  const [, bump] = useState(0);

  const provider = providers.find((p) => p.id === sourceId) ?? providers[0];
  const episodes = provider.episodes;
  const idx = episodes.findIndex((e) => e.number === ep);
  const current = episodes[idx];
  const prev = idx > 0 ? episodes[idx - 1] : null;
  const next = idx >= 0 && idx < episodes.length - 1 ? episodes[idx + 1] : null;

  // On first mount: restore prefs, preferred server and last-watched episode.
  useEffect(() => {
    const p = getPrefs();
    setPrefsState({ autoplay: p.autoplay, autoSkip: p.autoSkip });
    if (!initialSource && p.source && providers.some((x) => x.id === p.source)) setSourceId(p.source);
    if (!initialEp) {
      const h = getHistory().find((x) => x.id === anime.id);
      if (h) setEp(h.episode);
    }
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

  // Load the stream whenever episode or server changes.
  useEffect(() => {
    if (!mounted || !current) return;
    const url = `/watch/${anime.id}?ep=${ep}&source=${sourceId}`;
    window.history.replaceState(window.history.state, "", url);

    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    setStream(null);
    setStartAt(getPosition(anime.id, ep)?.t);
    fetch(`/api/stream?id=${anime.id}&ep=${ep}&source=${encodeURIComponent(sourceId)}`, { signal: ctrl.signal })
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
  }, [mounted, anime.id, ep, sourceId, current]);

  function updatePrefs(p: Partial<typeof prefs>) {
    setPrefsState((s) => ({ ...s, ...p }));
    setPrefs(p);
  }

  function pickSource(id: string) {
    setSourceId(id);
    setPrefs({ source: id });
  }

  const visible = useMemo(() => {
    const f = filter.trim();
    if (f) return episodes.filter((e) => String(e.number).startsWith(f) || e.title?.toLowerCase().includes(f.toLowerCase()));
    return episodes.slice(chunk * CHUNK, chunk * CHUNK + CHUNK);
  }, [episodes, filter, chunk]);

  const otherServers = providers.filter((p) => p.id !== sourceId && p.episodes.some((e) => e.number === ep));

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
              poster={current?.thumbnail ?? anime.banner ?? undefined}
              startAt={startAt}
              autoSkip={prefs.autoSkip}
              autoplayNext={prefs.autoplay}
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
            <div className="player player--placeholder">
              {loading ? <div className="spinner" /> : null}
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

          <div className="watch__controls">
            <div className="watch__title">
              <h1>{anime.title}</h1>
              <span>
                Episode {ep}
                {current?.title && current.title !== `Episode ${ep}` ? ` · ${current.title}` : ""}
                {current?.filler ? <em className="chip chip--warn">Filler</em> : null}
              </span>
            </div>
            <div className="watch__nav">
              <button className="btn btn--sm" disabled={!prev} onClick={() => prev && setEp(prev.number)}>
                ‹ Prev
              </button>
              <button className="btn btn--sm" disabled={!next} onClick={() => next && setEp(next.number)}>
                Next ›
              </button>
            </div>
          </div>

          <div className="watch__opts">
            <label className="toggle">
              <input type="checkbox" checked={prefs.autoplay} onChange={(e) => updatePrefs({ autoplay: e.target.checked })} />
              Autoplay next
            </label>
            <label className="toggle">
              <input type="checkbox" checked={prefs.autoSkip} onChange={(e) => updatePrefs({ autoSkip: e.target.checked })} />
              Auto-skip intro/outro
            </label>
          </div>

          <div className="servers">
            <span className="servers__label">Servers</span>
            {providers.map((p) => (
              <button
                key={p.id}
                className={`server ${p.id === sourceId ? "is-active" : ""}`}
                onClick={() => pickSource(p.id)}
                disabled={!p.episodes.some((e) => e.number === ep)}
                title={p.episodes.some((e) => e.number === ep) ? "" : "Episode not on this server"}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <aside className="episodes">
          <div className="episodes__head">
            <h2>Episodes</h2>
            <span className="muted">{episodes.length}</span>
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
          <div className={`episodes__list ${episodes.length > 30 ? "episodes__list--grid" : ""}`}>
            {visible.map((e) => {
              const pos = mounted ? getPosition(anime.id, e.number) : null;
              const watched = pos && pos.d ? pos.t / pos.d > 0.9 : false;
              return (
                <button
                  key={e.number}
                  className={`ep ${e.number === ep ? "is-active" : ""} ${watched ? "is-watched" : ""} ${e.filler ? "is-filler" : ""}`}
                  onClick={() => setEp(e.number)}
                  title={e.title}
                >
                  <span className="ep__num">{e.number}</span>
                  {episodes.length <= 30 ? <span className="ep__title">{e.title ?? `Episode ${e.number}`}</span> : null}
                  {pos && pos.d && !watched ? (
                    <span className="ep__progress" style={{ width: `${(pos.t / pos.d) * 100}%` }} />
                  ) : null}
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
