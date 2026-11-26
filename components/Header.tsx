"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAccount } from "@/lib/sync";
import { Icon } from "./Menu";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/search", label: "Browse" },
  { href: "/schedule", label: "Schedule" },
  { href: "/library", label: "My List" },
];

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const { user, status } = useAccount();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `/search?q=${encodeURIComponent(term)}` : "/search");
  }

  return (
    <header className={`header ${scrolled ? "header--solid" : ""}`}>
      <div className="header__inner">
        <Link href="/" className="logo">
          Anime<span>Stream</span>
        </Link>
        <nav className="nav">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={(n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)) ? "active" : ""}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <form className="search" onSubmit={submit} role="search">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search anime…"
            aria-label="Search anime"
          />
          <button type="submit" aria-label="Search">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </button>
        </form>
        <Link
          href="/account"
          className={`account-link ${pathname.startsWith("/account") ? "active" : ""}`}
          title={user ? `Signed in as ${user}` : "Sign in / import lists"}
        >
          <Icon name="user" size={18} />
          <span>{user ?? "Sign in"}</span>
          {user && status === "syncing" ? <i className="account-link__dot" /> : null}
        </Link>
      </div>
    </header>
  );
}
