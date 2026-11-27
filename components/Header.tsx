"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logout, useAccount } from "@/lib/sync";
import { openSettings } from "@/lib/settings-modal";
import AccountMenu from "./AccountMenu";
import Logo, { LogoMark } from "./Logo";
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
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" jumps to the search bar (unless you're already typing somewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Manga mode: the manga pages, or search with ?type=manga.
  const [mangaSearch, setMangaSearch] = useState(false);
  useEffect(() => {
    setMangaSearch(pathname === "/search" && new URLSearchParams(window.location.search).get("type") === "manga");
  }, [pathname]);
  const manga = pathname.startsWith("/manga") || mangaSearch;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    const params = new URLSearchParams();
    if (manga) params.set("type", "manga");
    if (term) params.set("q", term);
    router.push(`/search${params.size ? `?${params}` : ""}`);
  }

  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  // The sign-in, invite and admin screens are full-page cards without the site chrome.
  if (/^\/(gate|admin|settings\/anilist)(\/|$)/.test(pathname)) return null;
  // The manga reader is full screen with its own controls.
  if (/^\/manga\/\d+\/read\//.test(pathname)) return null;

  return (
    <>
      <aside className="rail">
        <Link href="/" className="rail__logo" aria-label="Mayoi home">
          <LogoMark size={40} />
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
          <Link
            href="/settings"
            className={`rail__item ${active("/settings") ? "is-active" : ""}`}
            title="Settings"
            onClick={(e) => (e.preventDefault(), openSettings("profile"))}
          >
            <Icon name="gear" size={20} />
            <span className="rail__label">Settings</span>
          </Link>
          {user ? (
            <button className="rail__item" title="Log out" onClick={() => void logout()}>
              <Icon name="power" size={20} />
              <span className="rail__label">Log out</span>
            </button>
          ) : null}
        </div>
      </aside>

      <header className={`topbar ${scrolled ? "topbar--solid" : ""}`}>
        <div className="topbar__left">
          <Link href={manga ? "/manga" : "/"} className="topbar__logo" aria-label="Mayoi home">
            <Logo />
          </Link>
          <nav className="mode" aria-label="Anime or manga">
            <Link href="/" className={!manga ? "is-active" : ""}>
              Anime
            </Link>
            <Link href="/manga" className={manga ? "is-active" : ""}>
              Manga
            </Link>
          </nav>
        </div>
        <form className="search" onSubmit={submit} role="search">
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={manga ? "Search manga…" : "Search anime…"}
            aria-label={manga ? "Search manga" : "Search anime"}
          />
          <button type="submit" aria-label="Search">
            <Icon name="search" size={17} />
          </button>
        </form>
        <AccountMenu />
      </header>
    </>
  );
}
