"use client";

import { useEffect, useState } from "react";
import { LogoMark } from "@/components/Logo";
import { ANILIST_CLIENT_ID, connectUrl } from "@/lib/anilist-sync";
import { loginLocal } from "@/lib/sync";

const AFTER_LOGIN_KEY = "as:after-login";

function nextPath() {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

/** Remember where to return after AniList, then go there to sign in. */
function goToAniList() {
  try {
    sessionStorage.setItem(AFTER_LOGIN_KEY, nextPath());
  } catch {}
  window.location.href = connectUrl();
}

type Step = "invite" | "create" | "signin";

/**
 * The private site's front door. New people enter an invite, then create a
 * Mayoi account or continue with AniList. Returning people sign in either way.
 */
export default function GatePage() {
  const [step, setStep] = useState<Step>("invite");
  const [configured, setConfigured] = useState(true);
  const [inviteUser, setInviteUser] = useState("");
  const [invitePass, setInvitePass] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "invite") {
      setError("That AniList account isn't on Mayoi yet. Enter your invite first.");
    }
    fetch("/api/gate")
      .then((r) => r.json())
      .then((d: { invite: string | null; configured: boolean }) => {
        setConfigured(d.configured);
        if (d.invite) setStep("create");
      })
      .catch(() => {});
  }, []);

  function go(s: Step) {
    setStep(s);
    setError(null);
    setPassword("");
    setConfirm("");
  }

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await fetch("/api/gate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: inviteUser, password: invitePass }),
    });
    const d = (await r.json().catch(() => ({}))) as { invite?: string; error?: string; admin?: boolean };
    if (r.ok && d.admin) {
      window.location.replace(nextPath());
      return;
    }
    setBusy(false);
    if (r.ok && d.invite) {
      setInvitePass("");
      go("create");
    } else setError(d.error ?? "That invite isn't valid.");
  }

  async function local(action: "signup" | "login", e: React.FormEvent) {
    e.preventDefault();
    if (action === "signup" && password !== confirm) {
      setError("The passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    const failed = await loginLocal(action, name, password);
    if (!failed) {
      // A full load, so the whole site starts signed in.
      window.location.replace(nextPath());
      return;
    }
    setBusy(false);
    setError(failed.error);
    if (failed.needsInvite) go("invite");
  }

  const anilistReady = !!ANILIST_CLIENT_ID;

  return (
    <div className="gate">
      <div className="gate__card">
        <LogoMark size={64} />
        <h1>Mayoi</h1>

        {!configured ? <p className="form__error">The site owner still needs to finish setup (AUTH_SECRET isn&apos;t set).</p> : null}

        {step === "invite" ? (
          <>
            <div className="gate__lock">
              <strong>Invite only</strong>
              <span>Mayoi is private. You need an invite to make an account.</span>
            </div>
            <form className="gate__form" onSubmit={redeem}>
              <input value={inviteUser} onChange={(e) => setInviteUser(e.target.value)} placeholder="Invite username" autoComplete="off" autoFocus required />
              <input
                type="password"
                value={invitePass}
                onChange={(e) => setInvitePass(e.target.value)}
                placeholder="Invite password"
                autoComplete="off"
                required
              />
              <button className="gate__primary" disabled={busy || !configured}>
                {busy ? "Checking…" : "Use invite"}
              </button>
            </form>
            <button className="gate__switch" onClick={() => go("signin")}>
              Already have an account? <strong>Sign in</strong>
            </button>
          </>
        ) : null}

        {step === "create" ? (
          <>
            <div className="gate__ok">Invite accepted. Make your account.</div>
            <form className="gate__form" onSubmit={(e) => local("signup", e)}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Username" autoComplete="username" autoFocus required minLength={3} maxLength={24} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (8+ characters)"
                autoComplete="new-password"
                required
                minLength={8}
              />
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm password" autoComplete="new-password" required />
              <button className="gate__primary" disabled={busy}>
                {busy ? "Creating…" : "Create Mayoi account"}
              </button>
            </form>
            <div className="gate__or">
              <span>or</span>
            </div>
            <button className="gate__anilist" onClick={goToAniList} disabled={!anilistReady}>
              <AniListIcon /> Continue with AniList
            </button>
          </>
        ) : null}

        {step === "signin" ? (
          <>
            <p className="gate__sub">Welcome back.</p>
            <form className="gate__form" onSubmit={(e) => local("login", e)}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Username" autoComplete="username" autoFocus required />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" required />
              <button className="gate__primary" disabled={busy || !configured}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>
            <div className="gate__or">
              <span>or</span>
            </div>
            <button className="gate__anilist" onClick={goToAniList} disabled={!anilistReady}>
              <AniListIcon /> Sign in with AniList
            </button>
            <button className="gate__switch" onClick={() => go("invite")}>
              New here? <strong>Use an invite</strong>
            </button>
          </>
        ) : null}

        {error ? <p className="form__error gate__error">{error}</p> : null}
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
