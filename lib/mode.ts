"use client";

// Anime or manga mode. Remembered, so Browse, Trending, search and My List stay
// on whichever one you picked until you switch back.

export type Mode = "anime" | "manga";

const KEY = "as:mode";
export const MODE_EVENT = "as:mode";

export function getMode(): Mode {
  try {
    return localStorage.getItem(KEY) === "manga" ? "manga" : "anime";
  } catch {
    return "anime";
  }
}

export function setMode(mode: Mode) {
  if (mode === getMode()) return;
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(MODE_EVENT));
}
