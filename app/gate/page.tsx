"use client";

import { useEffect, useState } from "react";
import { LogoMark } from "@/components/Logo";
import { ANILIST_CLIENT_ID, connectUrl } from "@/lib/anilist-sync";

const AFTER_LOGIN_KEY = "as:after-login";

/** Remember where to return after AniList, then go there to sign in. */
function goToAniList() {
  try {
    const next = new URLSearchParams(window.location.search).get("next");
    sessionStorage.setItem(AFTER_LOGIN_KEY, next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
  } catch {}
  window.location.href = connectUrl();
}

/** The private site's front door: an invite (first time only), then AniList sign-in. */
export default function GatePage() {
  const [state, setState] = useState<{ loading: boolean; invite: string | null; configured: boolean }>({
    loading: true,
    invite: null,
    configured: true,
  });
  const [mode, setMode] = useState<"signin" | "invite">("signin");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "invite") {
      setMode("invite");
      setError("That AniList account isn't on Mayoi yet. Enter your invite first, then continue with AniList.");
    }
    fetch("/api/gate")
      .then((r) => r.json())
      .then((d: { invite: string | null; configured: boolean }) => {
        setState({ loading: false, invite: d.invite, configured: d.configured });
        if (d.invite) setMode("invite");
      })
      .catch(() => setState((s) => ({ ...s, loading: false })));
  }, []);

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await fetch("/api/gate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, password }),
    });
    const d = (await r.json().catch(() => ({}))) as { invite?: string; error?: string };
    setBusy(false);
    if (r.ok && d.invite) {
      setState((s) => ({ ...s, invite: d.invite! }));
      setPassword("");
    } else setError(d.error ?? "That invite isn't valid.");
  }

  const ready = state.configured && !!ANILIST_CLIENT_ID;

  return (
    <div className="gate">
      <div className="gate__card">
        <LogoMark size={64} />
        <h1>Mayoi</h1>
        <p className="gate__sub">Invite only. Sign in with your AniList account.</p>

        {!ready && !state.loading ? (
          <p className="form__error">
            The site owner still needs to finish setup ({!state.configured ? "AUTH_SECRET" : "NEXT_PUBLIC_ANILIST_CLIENT_ID"} isn&apos;t set).
          </p>
        ) : null}

        {state.invite ? (
          <>
            <div className="gate__ok">Invite accepted. Now connect your AniList account to create your Mayoi account.</div>
            <button className="gate__anilist" onClick={goToAniList} disabled={!ready}>
              <AniListIcon /> Continue with AniList
            </button>
          </>
        ) : mode === "signin" ? (
          <>
            <button className="gate__anilist" onClick={goToAniList} disabled={!ready}>
              <AniListIcon /> Sign in with AniList
            </button>
            <button className="gate__switch" onClick={() => (setMode("invite"), setError(null))}>
              New here? <strong>I have an invite</strong>
            </button>
          </>
        ) : (
          <>
            <form className="gate__form" onSubmit={redeem}>
              <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="Invite username" autoComplete="off" autoFocus required />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Invite password"
                autoComplete="off"
                required
              />
              <button className="gate__submit" disabled={busy}>
                {busy ? "Checking…" : "Use invite"}
              </button>
            </form>
            <button className="gate__switch" onClick={() => (setMode("signin"), setError(null))}>
              Already have an account? <strong>Sign in with AniList</strong>
            </button>
          </>
        )}

        {error ? <p className="form__error gate__error">{error}</p> : null}
        <p className="gate__fine">You only need an invite the first time. After that, AniList is all it takes.</p>
      </div>
    </div>
  );
}

function AniListIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden fill="currentColor">
      <path d="M6.36 2.25 0 21.75h4.94l1.29-4.07h6.93l1.3 4.07h4.93L13 2.25H6.36zm.98 11.88 2.16-6.8 2.17 6.8H7.34zM17.42 2.25v4.06l4.64 15.44H24L18.82 2.25h-1.4z" />
    </svg>
  );
}
