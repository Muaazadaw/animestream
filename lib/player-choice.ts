"use client";

// Which video player the watch page uses. Remembered per browser.

export type PlayerKind = "plyr" | "artplayer";

export const PLAYERS: { id: PlayerKind; label: string }[] = [
  { id: "plyr", label: "Plyr" },
  { id: "artplayer", label: "ArtPlayer" },
];

const KEY = "as:player";
export const PLAYER_EVENT = "as:player";

export function getPlayerKind(): PlayerKind {
  try {
    return localStorage.getItem(KEY) === "artplayer" ? "artplayer" : "plyr";
  } catch {
    return "plyr";
  }
}

export function setPlayerKind(kind: PlayerKind) {
  try {
    localStorage.setItem(KEY, kind);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(PLAYER_EVENT));
}
