"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { logout, useAccount } from "@/lib/sync";
import AccountMenu from "./AccountMenu";
import { Icon } from "./Menu";

const NAV = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/trending", label: "Trending", icon: "flame" },
  { href: "/search", label: "Browse", icon: "compass" },
  { href: "/schedule", label: "Schedule", icon: "calendar" },
  { href: "/library", label: "My List", icon: "library" },
];

/** Left icon rail (bottom bar on phones) plus a top bar with search and the account menu. */
export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAccount();
  const [q, setQ] = useState("");
  const [scrolled, setScrolled] = useState(false);

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

  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      <aside className="rail">
        <Link href="/" className="rail__logo" aria-label="AnimeStream home">
          A<span>S</span>
        </Link>
        <nav className="rail__nav">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`rail__item ${active(n.href) ? "is-active" : ""}`} title={n.label}>
              <Icon name={n.icon} size={20} />
              <span className="rail__label">{n.label}</span>
            </Link>
          ))}
        </nav>
        <div className="rail__bottom">
          <Link href="/settings" className={`rail__item ${active("/settings") ? "is-active" : ""}`} title="Settings">
            <Icon name="gear" size={20} />
            <span className="rail__label">Settings</span>
          </Link>
          {user ? (
            <button className="rail__item" title="Log out" onClick={() => void logout()}>
              <Icon name="power" size={20} />
              <span className="rail__label">Log out</span>
            </button>
          ) : (
            <Link href="/settings#account" className="rail__item" title="Sign in">
              <Icon name="user" size={20} />
              <span className="rail__label">Sign in</span>
            </Link>
          )}
        </div>
      </aside>

      <header className={`topbar ${scrolled ? "topbar--solid" : ""}`}>
        <Link href="/" className="logo topbar__logo">
          Anime<span>Stream</span>
        </Link>
        <form className="search" onSubmit={submit} role="search">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search anime…" aria-label="Search anime" />
          <button type="submit" aria-label="Search">
            <Icon name="search" size={17} />
          </button>
        </form>
        <AccountMenu />
      </header>
    </>
  );
}
