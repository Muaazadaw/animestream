"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { getMode, MODE_EVENT, setMode, type Mode } from "@/lib/mode";
import { logout, useAccount } from "@/lib/sync";
import { openSettings } from "@/lib/settings-modal";
import AccountMenu from "./AccountMenu";
import Logo, { LogoMark } from "./Logo";
import { Icon } from "./Menu";
import PickForMe from "./PickForMe";
import SearchSuggestions from "./SearchSuggestions";

const NAV = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/search", label: "Browse", icon: "compass" },
  { href: "/schedule", label: "Schedule", icon: "calendar" },
  { href: "/library", label: "My List", icon: "library" },
];
const MANGA_NAV = [
  { href: "/manga", label: "Home", icon: "home" },
  { href: "/search?type=manga", label: "Browse", icon: "compass" },
  { href: "/library", label: "My List", icon: "library" },
];

/** Switches the remembered mode when you open an anime-only or manga-only page. */
function ModeWatcher({ onTrending }: { onTrending: (on: boolean) => void }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const type = params.get("type");
  const trending = pathname === "/search" && params.get("sort") === "TRENDING_DESC";
  useEffect(() => onTrending(trending), [trending, onTrending]);
  useEffect(() => {
    if (pathname.startsWith("/manga") || (pathname === "/search" && type === "manga")) setMode("manga");
    else if (pathname === "/" || /^\/(anime|watch|schedule|trending|search)(\/|$)/.test(pathname)) setMode("anime");
  }, [pathname, type]);
  return null;
}

/** Left icon rail (bottom bar on phones) plus a top bar with search and the account menu. */
export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAccount();
  const [q, setQ] = useState("");
  const [scrolled, setScrolled] = useState(false);
  // Phones: the search field opens over the top bar when you tap the icon.
  const [searchOpen, setSearchOpen] = useState(false);
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

  // Manga mode: on the manga pages, and on shared pages (My List, settings) after you picked it.
  const [mode, setModeState] = useState<Mode>("anime");
  const [trendingSearch, setTrendingSearch] = useState(false);
  useEffect(() => {
    const sync = () => setModeState(getMode());
    sync();
    window.addEventListener(MODE_EVENT, sync);
    return () => window.removeEventListener(MODE_EVENT, sync);
  }, []);
  const manga = pathname.startsWith("/manga") || mode === "manga";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = searchRef.current;
    if (input && getComputedStyle(input).display === "none") {
      setSearchOpen(true);
      setTimeout(() => searchRef.current?.focus(), 0);
      return;
    }
    setSearchOpen(false);
    const term = q.trim();
    const params = new URLSearchParams();
    if (manga) params.set("type", "manga");
    if (term) params.set("q", term);
    router.push(`/search${params.size ? `?${params}` : ""}`);
  }

  const nav = manga ? MANGA_NAV : NAV;
  const active = (href: string) => {
    const [path, query] = href.split("?");
    if (path === "/" || path === "/manga") return pathname === path;
    // Search sorted by trending is Trending (manga mode); any other search is Browse.
    if (path === "/search") return pathname === "/search" && (query?.includes("TRENDING") ?? false) === trendingSearch;
    return pathname.startsWith(path);
  };

  // The sign-in, invite and admin screens are full-page cards without the site chrome.
  if (/^\/(gate|admin|settings\/anilist)(\/|$)/.test(pathname)) return null;
  // The manga reader is full screen with its own controls.
  if (/^\/manga\/\d+\/read\//.test(pathname)) return null;

  return (
    <>
      <Suspense fallback={null}>
        <ModeWatcher onTrending={setTrendingSearch} />
      </Suspense>
      <aside className="rail">
        <Link href="/" className="rail__logo" aria-label="Mayoi home">
          <LogoMark size={40} />
        </Link>
        <nav className="rail__nav">
          {nav.map((n) => (
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
          {pathname !== "/" && pathname !== "/manga" ? (
            <button
              className="topbar__back"
              aria-label="Back"
              title="Back"
              onClick={() => (window.history.length > 1 ? router.back() : router.push(manga ? "/manga" : "/"))}
            >
              <Icon name="prev" size={18} />
            </button>
          ) : null}
          <Link href={manga ? "/manga" : "/"} className="topbar__logo" aria-label="Mayoi home">
            <Logo />
          </Link>
          <nav className="mode" aria-label="Anime or manga">
            <Link href="/" className={!manga ? "is-active" : ""} onClick={() => setMode("anime")}>
              Anime
            </Link>
            <Link href="/manga" className={manga ? "is-active" : ""} onClick={() => setMode("manga")}>
              Manga
            </Link>
          </nav>
        </div>
        <form className={`search ${searchOpen ? "is-open" : ""}`} onSubmit={submit} role="search">
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={manga ? "Search manga…" : "Search anime…"}
            aria-label={manga ? "Search manga" : "Search anime"}
            onBlur={(e) => !e.currentTarget.value && setSearchOpen(false)}
            onKeyDown={(e) => e.key === "Escape" && (setSearchOpen(false), e.currentTarget.blur())}
          />
          <PickForMe manga={manga} />
          <button type="submit" aria-label="Search">
            <Icon name="search" size={17} />
          </button>
          <SearchSuggestions q={q} manga={manga} onPick={() => (setQ(""), setSearchOpen(false), searchRef.current?.blur())} />
        </form>
        <AccountMenu />
      </header>
    </>
  );
}
