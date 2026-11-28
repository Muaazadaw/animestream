"use client";

import { useEffect, useState } from "react";
import { getPrefs, onPrefsChange, type Prefs } from "./storage";

/** Preferences from Settings, kept current as they change (null before the first render in the browser). */
export function usePrefs(): Prefs | null {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  useEffect(() => {
    const read = () => setPrefs(getPrefs());
    read();
    return onPrefsChange(read);
  }, []);
  return prefs;
}
