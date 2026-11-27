// How much this device can handle, so phones with little memory get a lighter
// site: fewer effects, smaller video buffers, data-saver manga pages.
//
// - low:  ≤ 2 GB memory, data saver on, or a 2G / slow-3G connection
// - mid:  ≤ 4 GB memory or ≤ 4 CPU cores
// - high: everything else
//
// Memory comes from navigator.deviceMemory (Chrome / Android). Safari doesn't
// report it, so iPhones are judged on CPU cores and data saver.
// DEVICE_SCRIPT sets <html data-perf="…"> before the page paints; perfTier()
// reads the same thing in code.

export type PerfTier = "low" | "mid" | "high";

type Nav = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
};

export function detectTier(): PerfTier {
  if (typeof navigator === "undefined") return "high";
  const nav = navigator as Nav;
  const mem = nav.deviceMemory;
  const cores = nav.hardwareConcurrency || 8;
  const conn = nav.connection;
  if (conn?.saveData || /(^|-)2g$|^3g$/.test(conn?.effectiveType ?? "")) return "low";
  if (mem !== undefined && mem <= 2) return "low";
  if ((mem !== undefined && mem <= 4) || cores <= 4) return "mid";
  return "high";
}

/** The tier set on <html> at load (falls back to detecting it now). */
export function perfTier(): PerfTier {
  if (typeof document === "undefined") return "high";
  const t = document.documentElement.dataset.perf;
  return t === "low" || t === "mid" || t === "high" ? t : detectTier();
}

/** hls.js buffer sizes (seconds of video kept in memory) for this device. */
export function hlsBuffers(): { maxBufferLength: number; maxMaxBufferLength: number; backBufferLength: number } {
  const t = perfTier();
  if (t === "low") return { maxBufferLength: 15, maxMaxBufferLength: 30, backBufferLength: 10 };
  if (t === "mid") return { maxBufferLength: 20, maxMaxBufferLength: 60, backBufferLength: 30 };
  return { maxBufferLength: 30, maxMaxBufferLength: 120, backBufferLength: 90 };
}

export const DEVICE_SCRIPT = `(() => {
  try {
    const n = navigator, c = n.connection || {}, m = n.deviceMemory, k = n.hardwareConcurrency || 8;
    let t = "high";
    if (c.saveData || /(^|-)2g$|^3g$/.test(c.effectiveType || "") || (m !== undefined && m <= 2)) t = "low";
    else if ((m !== undefined && m <= 4) || k <= 4) t = "mid";
    document.documentElement.dataset.perf = t;
  } catch {}
})();`;
