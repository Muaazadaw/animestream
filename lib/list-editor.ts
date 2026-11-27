"use client";

// Opens the list editor pop-up (status, progress, score, dates, rewatches,
// notes) for a show or manga from anywhere on the site.

import type { SavedAnime } from "./state";

export const LIST_EDITOR_EVENT = "as:list-editor";

export function openListEditor(item: SavedAnime & { banner?: string | null }) {
  window.dispatchEvent(new CustomEvent(LIST_EDITOR_EVENT, { detail: item }));
}
