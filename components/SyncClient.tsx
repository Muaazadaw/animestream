"use client";

import { useEffect } from "react";
import { startAniListSync } from "@/lib/anilist-sync";
import { startSync } from "@/lib/sync";

/** Starts account and AniList sync once per page load. Renders nothing. */
export default function SyncClient() {
  useEffect(() => {
    startSync();
    startAniListSync();
  }, []);
  return null;
}
