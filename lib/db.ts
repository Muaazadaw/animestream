// Tiny key-value store for accounts and synced libraries. Server only.
//
// - With Upstash Redis / Vercel KV configured (UPSTASH_REDIS_REST_URL + _TOKEN,
//   or KV_REST_API_URL + _TOKEN) data lives there, which works on Vercel.
// - Otherwise it's a JSON file in .data/ — fine for `npm start` on your own
//   machine or a VPS, but NOT on Vercel/serverless, where files don't persist.

import { promises as fs } from "fs";
import path from "path";

const REST_URL = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const FILE = path.join(process.cwd(), ".data", "db.json");

async function redis(cmd: unknown[]) {
  const res = await fetch(REST_URL!, {
    method: "POST",
    headers: { Authorization: `Bearer ${REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  const json = (await res.json()) as { result?: unknown; error?: string };
  if (!res.ok || json.error) throw new Error(json.error ?? `KV request failed (${res.status})`);
  return json.result;
}

let fileCache: Record<string, unknown> | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function loadFile() {
  if (!fileCache) {
    fileCache = await fs
      .readFile(FILE, "utf8")
      .then((s) => JSON.parse(s) as Record<string, unknown>)
      .catch(() => ({}));
  }
  return fileCache;
}

export async function dbGet<T>(key: string): Promise<T | null> {
  if (REST_URL && REST_TOKEN) {
    const raw = (await redis(["GET", key])) as string | null;
    return raw ? (JSON.parse(raw) as T) : null;
  }
  return ((await loadFile())[key] as T) ?? null;
}

export async function dbSet(key: string, value: unknown): Promise<void> {
  if (REST_URL && REST_TOKEN) {
    await redis(["SET", key, JSON.stringify(value)]);
    return;
  }
  // Serialise writes so concurrent requests don't clobber the file.
  const run = queue.then(async () => {
    const data = await loadFile();
    data[key] = value;
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE + ".tmp", JSON.stringify(data));
    await fs.rename(FILE + ".tmp", FILE);
  });
  queue = run.catch(() => {});
  await run;
}
