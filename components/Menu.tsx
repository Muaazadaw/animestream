"use client";

import { useEffect, useRef, useState } from "react";

// A button that opens a small popover menu above or below it.

type Props = {
  label: React.ReactNode;
  heading?: string;
  /** Open upwards (for controls near the bottom of the screen). */
  up?: boolean;
  align?: "left" | "right";
  className?: string;
  children: (close: () => void) => React.ReactNode;
};

export default function Menu({ label, heading, up, align = "left", className = "", children }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`menu ${className}`} ref={ref}>
      <button className={`menu__btn ${open ? "is-open" : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {label}
      </button>
      {open ? (
        <div className={`menu__pop ${up ? "menu__pop--up" : ""} menu__pop--${align}`} role="menu">
          {heading ? <div className="menu__heading">{heading}</div> : null}
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

type ItemProps = {
  icon?: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  extra?: React.ReactNode;
  title?: string;
};

export function MenuItem({ icon, active, disabled, onClick, children, extra, title }: ItemProps) {
  return (
    <button
      className={`menu__item ${active ? "is-active" : ""}`}
      disabled={disabled}
      onClick={onClick}
      role="menuitemradio"
      aria-checked={active}
      title={title}
    >
      {icon ? <span className="menu__icon">{icon}</span> : null}
      <span className="menu__label">{children}</span>
      {extra ? <span className="menu__extra">{extra}</span> : null}
      <span className="menu__check">{active ? <Icon name="check" /> : null}</span>
    </button>
  );
}

const PATHS: Record<string, React.ReactNode> = {
  check: <path d="M5 12.5 10 17l9-10" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  bolt: <path d="M13 3 5 14h6l-1 7 8-11h-6l1-7z" />,
  cc: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M10 10.5a2 2 0 1 0 0 3M16 10.5a2 2 0 1 0 0 3" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  dots: (
    <>
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="19" r="1" />
    </>
  ),
  sort: <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" />,
  eyeOff: (
    <>
      <path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-2.6 3.2M6.2 7.6C4.2 9.2 3 12 3 12s4 6 9 6a9 9 0 0 0 3.9-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  eye: (
    <>
      <path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <rect x="14" y="14" width="6" height="6" rx="1" />
    </>
  ),
  list: <path d="M4 6h16M4 12h16M4 18h16" />,
  prev: <path d="m15 6-6 6 6 6" />,
  next: <path d="m9 6 6 6-6 6" />,
  layers: <path d="m12 3 9 5-9 5-9-5 9-5zM3 13l9 5 9-5" />,
  image: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m21 16-5-5-8 8" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
};

export function Icon({ name, size = 16 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
