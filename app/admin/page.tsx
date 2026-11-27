"use client";

import { useCallback, useEffect, useState } from "react";
import { LogoMark } from "@/components/Logo";
import type { InviteSummary } from "@/lib/invites";

const KEY = "as:admin-pass";

/** The owner's invite page. Protected by ADMIN_PASSWORD (set only in Vercel). */
export default function AdminPage() {
  const [pass, setPass] = useState("");
  const [authed, setAuthed] = useState(false);
  const [invites, setInvites] = useState<InviteSummary[]>([]);
  const [note, setNote] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [created, setCreated] = useState<{ user: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const call = useCallback(
    async (method: string, body?: unknown, password = pass) => {
      const r = await fetch("/api/admin", {
        method,
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "Request failed");
      return d;
    },
    [pass],
  );

  const load = useCallback(
    async (password = pass) => {
      const d = (await call("GET", undefined, password)) as { invites: InviteSummary[] };
      setInvites(d.invites);
      setAuthed(true);
      try {
        sessionStorage.setItem(KEY, password);
      } catch {}
    },
    [call, pass],
  );

  // Stay unlocked for this browser tab.
  useEffect(() => {
    let saved = "";
    try {
      saved = sessionStorage.getItem(KEY) ?? "";
    } catch {}
    if (saved) {
      setPass(saved);
      load(saved).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const d = (await call("POST", { note, maxUses })) as { invite: InviteSummary; password: string };
      setCreated({ user: d.invite.user, password: d.password });
      setNote("");
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  async function revoke(user: string) {
    if (!confirm(`Revoke ${user}? Accounts already made with it keep working.`)) return;
    await call("DELETE", { user }).catch((err: Error) => setError(err.message));
    await load().catch(() => {});
  }

  if (!authed) {
    return (
      <div className="gate">
        <form className="gate__card" onSubmit={unlock}>
          <LogoMark size={56} />
          <h1>Invites</h1>
          <p className="gate__sub">Owner only.</p>
          <div className="gate__form">
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Admin password" autoFocus required />
            <button className="gate__submit">Unlock</button>
          </div>
          {error ? <p className="form__error gate__error">{error}</p> : null}
        </form>
      </div>
    );
  }

  return (
    <div className="admin">
      <header className="admin__head">
        <LogoMark size={36} />
        <h1>Mayoi invites</h1>
        <button
          className="sbtn"
          onClick={() => {
            try {
              sessionStorage.removeItem(KEY);
            } catch {}
            setAuthed(false);
            setPass("");
          }}
        >
          Lock
        </button>
      </header>

      <form className="admin__create" onSubmit={create}>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Who is it for? (optional note)" maxLength={80} />
        <label>
          Uses
          <input type="number" min={1} max={100} value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value) || 1)} />
        </label>
        <button className="sbtn sbtn--primary" disabled={busy}>
          {busy ? "Creating…" : "Create invite"}
        </button>
      </form>

      {created ? (
        <div className="admin__new">
          <strong>New invite — copy it now, the password won&apos;t be shown again.</strong>
          <div className="admin__creds">
            <span>
              Username <code>{created.user}</code>
            </span>
            <span>
              Password <code>{created.password}</code>
            </span>
            <button
              className="sbtn"
              onClick={() =>
                navigator.clipboard?.writeText(`Mayoi invite\nSite: ${location.origin}\nUsername: ${created.user}\nPassword: ${created.password}`)
              }
            >
              Copy
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="form__error">{error}</p> : null}

      <table className="admin__table">
        <thead>
          <tr>
            <th>Invite</th>
            <th>Note</th>
            <th>Used</th>
            <th>Accounts</th>
            <th>Created</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {invites.length === 0 ? (
            <tr>
              <td colSpan={6} className="muted">
                No invites yet.
              </td>
            </tr>
          ) : null}
          {invites.map((i) => (
            <tr key={i.user} className={i.revoked ? "is-revoked" : ""}>
              <td>
                <code>{i.user}</code>
              </td>
              <td>{i.note || "—"}</td>
              <td>
                {i.revoked ? "Revoked" : `${i.usedBy.length} / ${i.maxUses}`}
              </td>
              <td>{i.usedBy.join(", ") || "—"}</td>
              <td>{new Date(i.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
              <td>
                {!i.revoked && i.usedBy.length < i.maxUses ? (
                  <button className="sbtn sbtn--danger" onClick={() => revoke(i.user)}>
                    Revoke
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
