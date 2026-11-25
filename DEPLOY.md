# Hosting AnimeStream

Three parts: **prepare your videos → upload them to storage → put the site online.**
Only host videos you have the rights to (your own work, Creative Commons, or licensed).

---

## 1. Prepare videos

Install ffmpeg once (then open a new terminal):

```bash
winget install Gyan.FFmpeg
```

Put one show's episodes in a folder, e.g. `D:\videos\my-show\Ep 01.mp4, Ep 02.mp4 …`
(subtitles next to them with the same name — `Ep 01.srt` — are picked up automatically).

Find the show's AniList id: open it on the site, the URL is `/anime/<id>`.

```bash
npm run videos -- "D:\videos\my-show" --anilist 12345 --intro 90-180
```

This writes `hosting/12345/` with:

```
episodes.json          ← the manifest the site reads
ep1/master.m3u8        ← adaptive stream (1080p / 720p / 480p)
ep1/1080p/…  ep1/720p/…  ep1/480p/…
ep1/thumb.jpg
ep1/en.vtt             ← if a subtitle was found
```

Run it again any time you add episodes; existing ones are skipped. You can edit
`episodes.json` by hand (titles, `"filler": true`, intro/outro per episode) — reruns keep your edits.

## 2. Upload to storage

### Option A: Cloudflare R2 (recommended: free egress, 10 GB free)

1. Cloudflare dashboard → **R2** → **Create bucket** (e.g. `anime`).
2. Bucket → **Settings → Public access** → enable the `r2.dev` URL (or connect your own domain).
3. Bucket → **Settings → CORS policy** → paste [hosting-config/r2-cors.json](hosting-config/r2-cors.json)
   with your real site URL.
4. Upload the **contents** of the `hosting` folder (so `12345/episodes.json` is at the bucket root).
   Easiest for many files is rclone:
   ```bash
   winget install Rclone.Rclone
   rclone config          # add an "s3" remote, provider Cloudflare, with an R2 API token
   rclone copy hosting r2:anime --progress
   ```
5. Your base URL is the public bucket URL, e.g. `https://pub-xxxx.r2.dev`.

### Option B: Bunny Storage + CDN

Create a Storage Zone, attach a Pull Zone, upload `hosting/` contents (FTP or their web UI),
and in the Pull Zone enable **CORS headers** for `m3u8, ts, vtt, json, jpg`. Base URL = the Pull Zone hostname.

### Option C: GitHub Pages (small tests only)

Push the `hosting` folder contents to a repo, enable Pages. Base URL = `https://<user>.github.io/<repo>`.
Limits: 100 MB per file, ~1 GB per site.

Check it works: open `<base URL>/12345/episodes.json` in a browser.

## 3. Put the site online (Vercel, free)

1. Create a GitHub repo and push this folder:
   ```bash
   git init
   git add .
   git commit -m "AnimeStream"
   git branch -M main
   git remote add origin https://github.com/<you>/animestream.git
   git push -u origin main
   ```
2. [vercel.com](https://vercel.com) → **Add New → Project** → import the repo → Framework: Next.js (auto).
3. **Environment Variables**:
   | Name | Value |
   | --- | --- |
   | `SELF_HOSTED_BASE_URL` | your storage base URL from step 2 |
   | `ENABLE_DEMO_SOURCE` | `false` |
4. **Deploy.** Add your domain under **Settings → Domains** if you have one.
5. Put the final site URL into your storage CORS settings (step 2) and you're done.

Shows that have an `episodes.json` get a **Main server** button on the watch page; everything else
shows its official streaming links.

## Running on your own PC instead

```bash
npm install
npm run build
npm start          # http://localhost:3000
```

Set the variables in a `.env.local` file (copy `.env.example`).

## Before going public

- Keep proof of rights for every title (license, permission email, CC link).
- Credit creators (required by CC BY).
- Add a contact / takedown page.
