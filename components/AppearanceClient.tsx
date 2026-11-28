"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { applyAppearance } from "@/lib/appearance";
import { getPrefs, onPrefsChange } from "@/lib/storage";

/** Card links that "Open anime on: Watch" sends to the watch page instead of the info page. */
const CARD = ".pcard, .card, .lcard, .tcard, .slist__item, .season, .notif__item";

/** Keeps Appearance settings applied, and handles the Watch/Info card preference. Renders nothing. */
export default function AppearanceClient() {
  const router = useRouter();

  useEffect(() => {
    const apply = () => applyAppearance(getPrefs());
    apply();
    return onPrefsChange(apply);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest?.("a[href^='/anime/']") as HTMLAnchorElement | null;
      const id = a?.getAttribute("href")?.match(/^\/anime\/(\d+)$/)?.[1];
      if (!a || !id || !a.closest(CARD) || getPrefs().openOn !== "watch") return;
      e.preventDefault();
      router.push(`/watch/${id}`);
    };
    // Capture phase, so it runs before Next's own link handling.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);

  return null;
}
