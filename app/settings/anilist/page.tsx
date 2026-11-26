"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { completeConnect } from "@/lib/anilist-sync";

// AniList redirects here after login with the token in the URL hash.
export default function AniListCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    // Drop the token from the address bar and history straight away.
    window.history.replaceState(null, "", "/settings/anilist");
    completeConnect(hash)
      .then(() => router.replace("/settings#anilist"))
      .catch((e: Error) => setError(e.message));
  }, [router]);

  return (
    <div className="container page center">
      {error ? (
        <>
          <p className="form__error">Couldn&apos;t connect AniList: {error}</p>
          <Link href="/settings#anilist" className="btn btn--sm">
            Back to settings
          </Link>
        </>
      ) : (
        <>
          <div className="spinner" />
          <p className="muted">Connecting your AniList and importing your list…</p>
        </>
      )}
    </div>
  );
}
