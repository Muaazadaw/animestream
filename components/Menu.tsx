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
  inbox: (
    <>
      <path d="M3 13h5l1.5 3h5L16 13h5" />
      <path d="M5.5 5h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  power: <path d="M12 3v9M6.3 6.3a8 8 0 1 0 11.4 0" />,
  heart: <path d="M12 20s-7-4.4-9.2-9A5 5 0 0 1 12 6a5 5 0 0 1 9.2 5c-2.2 4.6-9.2 9-9.2 9z" />,
  bookmark: <path d="M6 3h12v18l-6-4-6 4z" />,
  play: <path d="M7 4v16l13-8z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  rewatch: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
  dropped: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  home: <path d="M3 11 12 3l9 8M5 9.5V21h5v-6h4v6h5V9.5" />,
  flame: <path d="M12 3s5 4.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 1.5-4s.5 2.5 2.5 2.5C11 8 12 3 12 3z" />,
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  library: <path d="M5 4v16M10 4v16M15 5l4 15" />,
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  cloud: <path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 8.5 4.75 4.75 0 0 1 17.5 18z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </>
  ),
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.4M12 17v.5" />
    </>
  ),
  book: <path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5v13" />,
  single: <rect x="7" y="4" width="10" height="16" rx="1.5" />,
  double: (
    <>
      <rect x="3.5" y="5" width="7.5" height="14" rx="1.5" />
      <rect x="13" y="5" width="7.5" height="14" rx="1.5" />
    </>
  ),
  strip: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="1.5" />
      <path d="M7 9h10M7 15h10" />
    </>
  ),
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  minus: <path d="M5 12h14" />,
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
