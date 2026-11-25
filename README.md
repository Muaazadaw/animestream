# AnimeStream

A Next.js anime site: discovery and metadata from [AniList](https://anilist.co), a custom HLS/MP4 player,
and a pluggable source system for video you have the rights to host.

## Run it

```bash
npm install
cp .env.example .env.local   # optional
npm run dev                  # http://localhost:3000
```

`npm run build && npm start` for production. **See [DEPLOY.md](DEPLOY.md)** for converting your videos
(`npm run videos`), uploading them, and putting the site online.

## Pages

| Route | What it does |
| --- | --- |
| `/` | Spotlight carousel, continue watching, trending / seasonal / upcoming / popular / top rated rows |
| `/search` | Search with genre, format, status and sort filters, paginated |
| `/anime/[id]` | Details, airing countdown, trailer, characters, related, recommendations, official streaming links |
| `/watch/[id]?ep=&source=` | Player, server picker, episode list, prev/next, autoplay, auto-skip |
| `/schedule` | 7-day airing schedule in the viewer's time zone |
| `/library` | Watch history and watchlist (stored in the browser) |

## Player

- HLS through hls.js (native HLS on Safari), and MP4
- Quality picker (auto + each rendition, or multiple MP4 sources), playback speed
- Skip intro / outro button, optional auto-skip
- Resume position per episode, "next episode in 5…" autoplay
- WebVTT subtitles
- Keys: Space/K play · ←/→ 5s · J/L 10s · F fullscreen · M mute · S skip · N next

## Adding a video source

Every source implements `SourceProvider` in [lib/sources/types.ts](lib/sources/types.ts):

```ts
interface SourceProvider {
  id: string;
  name: string;
  isEnabled(): boolean;
  getEpisodes(anime: AnimeRef): Promise<EpisodeInfo[]>;
  getStream(anime: AnimeRef, episode: number): Promise<Stream | null>;
}
```

`anime.id` is the AniList id, so map your catalog to it. Register providers in
[lib/sources/index.ts](lib/sources/index.ts). Providers run on the server, so API keys stay private.

Two are included:

- **`self-hosted`** ([lib/sources/self-hosted.ts](lib/sources/self-hosted.ts)) reads an `episodes.json`
  manifest per show from `SELF_HOSTED_BASE_URL`. The file documents the format. Enabled when that env var is set.
- **`demo`** ([lib/sources/demo.ts](lib/sources/demo.ts)) plays Blender Foundation open movies (CC BY) for every
  episode so you can try the player. Turn it off with `ENABLE_DEMO_SOURCE=false`.

Shows with no episodes on any source show their official streaming links instead.

Your video host must send CORS headers (`Access-Control-Allow-Origin`) for HLS playback and subtitles.
