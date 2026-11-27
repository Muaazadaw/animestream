"use client";

// Opening Settings as a pop-up over the current page.

export type SettingsSection =
  | "profile"
  | "connections"
  | "data"
  | "browsing"
  | "appearance"
  | "language"
  | "watching"
  | "history"
  | "keys-general"
  | "keys-watching"
  | "keys-player";

export const OPEN_SETTINGS_EVENT = "as:open-settings";

export function openSettings(section: SettingsSection = "profile") {
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, { detail: section }));
}
