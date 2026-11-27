"use client";

import { useEffect, useState } from "react";
import { LogoMark } from "@/components/Logo";
import { completeConnect } from "@/lib/anilist-sync";

// AniList redirects here after login with the token in the URL hash. It signs
// in to Mayoi with it (creating the account if an invite was just entered),
// links the list, then returns to where the person was going.
export default function AniListCallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    // Drop the token from the address bar and history straight away.
    window.history.replaceState(null, "", "/settings/anilist");
    completeConnect(hash)
      .then(() => {
        let next = "/";
        try {
          next = sessionStorage.getItem("as:after-login") || "/";
          sessionStorage.removeItem("as:after-login");
        } catch {}
        // A full load, so the whole site (header, lists) starts signed in.
        window.location.replace(next);
      })
      .catch((e: Error & { needsInvite?: boolean }) => {
        if (e.needsInvite) window.location.replace("/gate?error=invite");
        else setError(e.message);
      });
  }, []);

  return (
    <div className="gate">
      <div className="gate__card">
        <LogoMark size={56} />
        {error ? (
          <>
            <p className="form__error gate__error">Couldn&apos;t sign in with AniList: {error}</p>
            <a href="/gate" className="gate__submit">
              Back to sign in
            </a>
          </>
        ) : (
          <>
            <div className="spinner" />
            <p className="gate__sub">Signing you in and bringing over your AniList list…</p>
          </>
        )}
      </div>
    </div>
  );
}
