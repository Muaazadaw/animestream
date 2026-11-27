// Applies the Appearance settings (theme, accent, roundness, card size) to <html>.
// APPEARANCE_SCRIPT runs inline in <head> before the page paints, so a custom
// accent or the black theme doesn't flash in; applyAppearance keeps it in step
// when settings change.

import { ACCENTS } from "./state";
import type { Prefs } from "./storage";

export function applyAppearance(p: Pick<Prefs, "theme" | "accent" | "radius" | "cardSize">) {
  const root = document.documentElement;
  const [a, b] = (ACCENTS[p.accent] ?? ACCENTS.pink).colors;
  root.style.setProperty("--accent", a);
  root.style.setProperty("--accent-2", b);
  // 50 → the default 12px; 0 → square; 100 → 24px.
  root.style.setProperty("--radius", `${Math.round((p.radius / 100) * 24)}px`);
  root.dataset.theme = p.theme;
  root.dataset.cards = p.cardSize;
}

export const APPEARANCE_SCRIPT = `(() => {
  try {
    const p = JSON.parse(localStorage.getItem("as:prefs") || "{}");
    const accents = ${JSON.stringify(Object.fromEntries(Object.entries(ACCENTS).map(([k, v]) => [k, v.colors])))};
    const c = accents[p.accent] || accents.pink;
    const r = document.documentElement;
    r.style.setProperty("--accent", c[0]);
    r.style.setProperty("--accent-2", c[1]);
    if (typeof p.radius === "number") r.style.setProperty("--radius", Math.round(p.radius / 100 * 24) + "px");
    r.dataset.theme = p.theme || "dark";
    r.dataset.cards = p.cardSize || "medium";
  } catch {}
})();`;
