"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import SettingsPanel from "@/components/SettingsPanel";
import type { SettingsSection } from "@/lib/settings-modal";

const ALIASES: Record<string, SettingsSection> = {
  account: "profile",
  anilist: "connections",
  import: "data",
  playback: "watching",
  shortcuts: "keys-general",
};

/** Settings as a full page (direct links like /settings#watching); the gear opens it as a pop-up instead. */
export default function SettingsPage() {
  const router = useRouter();
  const [section, setSection] = useState<SettingsSection>("profile");

  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.slice(1);
      if (h) setSection((ALIASES[h] ?? h) as SettingsSection);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  return (
    <div className="settings-page">
      <SettingsPanel initial={section} onClose={() => (window.history.length > 1 ? router.back() : router.push("/"))} />
    </div>
  );
}
