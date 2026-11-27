"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { OPEN_SETTINGS_EVENT, type SettingsSection } from "@/lib/settings-modal";
import SettingsPanel from "./SettingsPanel";

/** Settings as a pop-up over the current page; opened with openSettings(). */
export default function SettingsModal() {
  const [section, setSection] = useState<SettingsSection | null>(null);
  const pathname = usePathname();
  const close = useCallback(() => setSection(null), []);

  useEffect(() => {
    const onOpen = (e: Event) => setSection((e as CustomEvent<SettingsSection>).detail ?? "profile");
    window.addEventListener(OPEN_SETTINGS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, onOpen);
  }, []);

  // Close when navigating away (e.g. "Manage history"), and stop the page behind from scrolling.
  useEffect(() => close(), [pathname, close]);
  useEffect(() => {
    if (!section) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [section]);

  if (!section) return null;
  return (
    <div className="smodal" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <SettingsPanel initial={section} onClose={close} modal />
    </div>
  );
}
