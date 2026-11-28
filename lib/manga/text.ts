// Text helpers shared by the scraped manga sources.

/** Unescapes the few HTML entities the sites use in titles. */
export const decode = (s: string) =>
  s.replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

/** A title reduced for comparison: lowercase letters and digits, single spaces. */
export const norm = (s: string) =>
  s.normalize("NFKC").toLowerCase().replace(/[’']/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
