#!/usr/bin/env node
// Converts a folder of episode files into HLS (multi-quality) and writes the
// episodes.json manifest the self-hosted source reads.
//
// Usage:
//   node scripts/prepare-videos.mjs <input-folder> --anilist <id> [options]
//
// Options:
//   --out <folder>          Output root (default: ./hosting). Files go to <out>/<anilistId>/
//   --qualities 1080,720,480  Renditions to produce (default: 1080,720,480)
//   --intro 90-180          Intro range in seconds, applied to every episode
//   --outro 1320-1410       Outro range in seconds, applied to every episode
//   --force                 Re-encode episodes that already exist in the output
//
// Input files are matched to episode numbers by name: "Ep 01.mp4", "S01E03.mkv",
// "Show - 12 [1080p].mkv" and "7.mp4" all work. A subtitle next to a video with
// the same base name (.srt, .vtt or .ass) is converted to WebVTT and attached.
//
// Requires ffmpeg and ffprobe on PATH.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const VIDEO_EXT = new Set([".mp4", ".mkv", ".mov", ".webm", ".avi", ".m4v"]);
const SUB_EXT = [".vtt", ".srt", ".ass"];
const BITRATES = { 2160: 14000, 1440: 9000, 1080: 5000, 720: 2800, 480: 1200, 360: 700 };

function parseArgs(argv) {
  const args = { _: [], out: "hosting", qualities: "1080,720,480", force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") args.force = true;
    else if (a.startsWith("--")) args[a.slice(2)] = argv[++i];
    else args._.push(a);
  }
  return args;
}

function range(v) {
  if (!v) return undefined;
  const [start, end] = v.split("-").map(Number);
  if (!(end > start)) throw new Error(`Bad range "${v}", expected e.g. 90-180`);
  return { start, end };
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 1 << 26, ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${cmd} failed:\n${(r.stderr || "").split("\n").slice(-15).join("\n")}`);
  return r.stdout;
}

function episodeNumber(file) {
  const name = path.parse(file).name;
  const patterns = [
    /S\d+\s*E(\d+)/i,
    /\bEP?\.?\s*(\d+)/i,
    /\bEpisode\s*(\d+)/i,
    /\s-\s(\d+)(?:v\d)?\b/,
    /^(\d+)$/,
    /\b(\d{1,4})\b(?!p)/,
  ];
  for (const p of patterns) {
    const m = name.replace(/\[[^\]]*\]|\([^)]*\)/g, " ").match(p);
    if (m) return Number(m[1]);
  }
  return null;
}

function probe(file) {
  const out = run("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file]);
  const info = JSON.parse(out);
  const video = info.streams.find((s) => s.codec_type === "video");
  const hasAudio = info.streams.some((s) => s.codec_type === "audio");
  return { height: video?.height ?? 720, hasAudio, duration: Number(info.format.duration) || 0 };
}

function encodeHls(input, outDir, qualities, hasAudio) {
  fs.mkdirSync(outDir, { recursive: true });
  const n = qualities.length;
  const split = `[0:v]split=${n}${qualities.map((_, i) => `[v${i}]`).join("")}`;
  const scales = qualities.map((q, i) => `[v${i}]scale=-2:${q}[v${i}o]`).join(";");
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-stats", "-i", input, "-filter_complex", `${split};${scales}`];

  qualities.forEach((q, i) => {
    const kbps = BITRATES[q] ?? Math.round(q * 4.5);
    args.push(
      "-map", `[v${i}o]`,
      `-c:v:${i}`, "libx264", "-preset", "veryfast", "-profile:v", "high",
      `-b:v:${i}`, `${kbps}k`, `-maxrate:v:${i}`, `${Math.round(kbps * 1.2)}k`, `-bufsize:v:${i}`, `${kbps * 2}k`,
      "-g", "48", "-keyint_min", "48", "-sc_threshold", "0",
    );
    if (hasAudio) args.push("-map", "0:a:0", `-c:a:${i}`, "aac", `-b:a:${i}`, "128k", "-ac", "2");
  });

  const streamMap = qualities.map((q, i) => (hasAudio ? `v:${i},a:${i},name:${q}p` : `v:${i},name:${q}p`)).join(" ");
  // Forward slashes, or ffmpeg writes "720p\index.m3u8" into the master playlist on Windows.
  const dir = outDir.split(path.sep).join("/");
  args.push(
    "-var_stream_map", streamMap,
    "-master_pl_name", "master.m3u8",
    "-f", "hls", "-hls_time", "6", "-hls_playlist_type", "vod", "-hls_flags", "independent_segments",
    "-hls_segment_filename", `${dir}/%v/seg_%04d.ts`,
    `${dir}/%v/index.m3u8`,
  );
  run("ffmpeg", args, { stdio: ["ignore", "inherit", "pipe"] });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = args._[0];
  const anilist = Number(args.anilist);
  if (!input || !Number.isInteger(anilist)) {
    console.error("Usage: node scripts/prepare-videos.mjs <input-folder> --anilist <id> [--out hosting] [--qualities 1080,720,480] [--intro 90-180] [--outro 1320-1410] [--force]");
    process.exit(1);
  }
  for (const bin of ["ffmpeg", "ffprobe"]) {
    try {
      run(bin, ["-version"]);
    } catch {
      console.error(`${bin} not found. Install it (winget install Gyan.FFmpeg) and open a new terminal.`);
      process.exit(1);
    }
  }

  const wanted = args.qualities.split(",").map(Number).filter(Boolean).sort((a, b) => b - a);
  const intro = range(args.intro);
  const outro = range(args.outro);
  const showDir = path.resolve(args.out, String(anilist));
  const manifestPath = path.join(showDir, "episodes.json");
  fs.mkdirSync(showDir, { recursive: true });

  // Keep titles / markers you edited by hand in an existing manifest.
  const existing = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")).episodes ?? [] : [];
  const byNumber = new Map(existing.map((e) => [e.number, e]));

  const files = fs
    .readdirSync(input)
    .filter((f) => VIDEO_EXT.has(path.extname(f).toLowerCase()))
    .map((f) => ({ file: path.join(input, f), number: episodeNumber(f) }));

  const unmatched = files.filter((f) => f.number === null);
  for (const u of unmatched) console.warn(`! Skipping "${path.basename(u.file)}": no episode number in the name`);

  const seen = new Set();
  for (const { file, number } of files.filter((f) => f.number !== null).sort((a, b) => a.number - b.number)) {
    if (seen.has(number)) {
      console.warn(`! Skipping "${path.basename(file)}": episode ${number} appears twice`);
      continue;
    }
    seen.add(number);

    const epDir = path.join(showDir, `ep${number}`);
    const rel = (p) => path.relative(showDir, p).split(path.sep).join("/");
    const done = fs.existsSync(path.join(epDir, "master.m3u8"));
    console.log(`\n▶ Episode ${number}: ${path.basename(file)}`);

    const { height, hasAudio, duration } = probe(file);
    if (!done || args.force) {
      // Never upscale: drop renditions taller than the source.
      let qualities = wanted.filter((q) => q <= height);
      if (qualities.length === 0) qualities = [Math.min(height, wanted.at(-1))];
      fs.rmSync(epDir, { recursive: true, force: true });
      encodeHls(file, epDir, qualities, hasAudio);
      run("ffmpeg", [
        "-y", "-loglevel", "error", "-ss", String(Math.min(60, duration / 3)), "-i", file,
        "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "4", path.join(epDir, "thumb.jpg"),
      ]);
    } else {
      console.log("  already encoded (use --force to redo)");
    }

    const base = file.slice(0, -path.extname(file).length);
    const sub = SUB_EXT.map((e) => base + e).find((p) => fs.existsSync(p));
    let subtitles;
    if (sub) {
      const vtt = path.join(epDir, "en.vtt");
      run("ffmpeg", ["-y", "-loglevel", "error", "-i", sub, vtt]);
      subtitles = [{ url: rel(vtt), lang: "en", label: "English", default: true }];
    }

    const prev = byNumber.get(number) ?? {};
    byNumber.set(number, {
      number,
      title: prev.title ?? `Episode ${number}`,
      thumbnail: rel(path.join(epDir, "thumb.jpg")),
      ...(prev.filler ? { filler: true } : {}),
      sources: [{ url: rel(path.join(epDir, "master.m3u8")), type: "hls" }],
      ...(subtitles ?? prev.subtitles ? { subtitles: subtitles ?? prev.subtitles } : {}),
      ...((intro ?? prev.intro) ? { intro: intro ?? prev.intro } : {}),
      ...((outro ?? prev.outro) ? { outro: outro ?? prev.outro } : {}),
    });
  }

  const episodes = [...byNumber.values()].sort((a, b) => a.number - b.number);
  fs.writeFileSync(manifestPath, JSON.stringify({ episodes }, null, 2));
  console.log(`\n✓ ${episodes.length} episode(s) in ${manifestPath}`);
  console.log(`  Upload the "${path.resolve(args.out)}" folder to your storage so it serves <base>/${anilist}/episodes.json`);
}

try {
  main();
} catch (e) {
  console.error(`\n✗ ${e.message}`);
  process.exit(1);
}
