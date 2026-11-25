"use client";

import { useEffect, useState } from "react";

function fmt(seconds: number) {
  if (seconds <= 0) return "Airing now";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s}s`;
}

/** Live countdown to a unix timestamp (seconds). */
export default function Countdown({ at }: { at: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  // Render nothing until mounted so server and client markup match.
  return <span suppressHydrationWarning>{now === null ? "" : fmt(at - now)}</span>;
}
