"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoMark } from "./Logo";
import { Icon } from "./Menu";

const DISMISS_KEY = "as:install-dismissed";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Registers the service worker (so Mayoi can be installed as an app) and shows
 * a small, dismissible "Install Mayoi" card on phones: Android gets the real
 * install dialog, iPhone gets the two taps to do it from Safari.
 */
export default function PwaClient() {
  const pathname = usePathname();
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [ios, setIos] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    if (isStandalone()) return;
    let dismissed = false;
    try {
      dismissed = !!localStorage.getItem(DISMISS_KEY);
    } catch {}
    if (dismissed) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iPhone/iPad Safari has no install event; offer the manual steps instead.
    const ua = navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
    if (isIos && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua)) {
      setIos(true);
      setShow(true);
    }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  }

  // Not on the sign-in screens, and only once someone's in.
  if (!show || /^\/(gate|admin|settings\/anilist)/.test(pathname)) return null;

  return (
    <div className="install" role="dialog" aria-label="Install Mayoi">
      <LogoMark size={40} />
      <div className="install__text">
        <strong>Install Mayoi</strong>
        {ios ? (
          <span>
            Tap <b>Share</b> <ShareIcon /> then <b>Add to Home Screen</b>.
          </span>
        ) : (
          <span>Add it to your home screen. It opens full screen, like an app.</span>
        )}
      </div>
      {!ios && prompt ? (
        <button
          className="install__btn"
          onClick={async () => {
            await prompt.prompt();
            const { outcome } = await prompt.userChoice;
            if (outcome === "accepted") setShow(false);
            setPrompt(null);
          }}
        >
          Install
        </button>
      ) : null}
      <button className="install__close" onClick={dismiss} aria-label="Not now">
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: "-2px" }} aria-hidden>
      <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}
