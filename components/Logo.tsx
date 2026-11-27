import { useId } from "react";

/** The Mayoi mark: a crescent moon with a wandering star ("mayoi" = lost, wandering). */
export function LogoMark({ size = 32, tile = true }: { size?: number; tile?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className="logo-mark">
      <defs>
        <linearGradient id={`${id}g`} x1="12" y1="10" x2="52" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--accent, #d03a73)" />
          <stop offset="1" stopColor="var(--accent-2, #6a40e0)" />
        </linearGradient>
        <mask id={`${id}m`}>
          <rect width="64" height="64" fill="#fff" />
          <circle cx="38" cy="25" r="16" fill="#000" />
        </mask>
      </defs>
      {tile ? <rect width="64" height="64" rx="14" fill="#0b0a10" /> : null}
      <circle cx="29" cy="34" r="19" fill={`url(#${id}g)`} mask={`url(#${id}m)`} />
      <path d="M47 11c.6 3.4 2.6 5.4 6 6-3.4.6-5.4 2.6-6 6-.6-3.4-2.6-5.4-6-6 3.4-.6 5.4-2.6 6-6z" fill="#e7dcff" />
    </svg>
  );
}

/** Mark + "Mayoi" wordmark. */
export default function Logo() {
  return (
    <span className="logo">
      <LogoMark size={28} tile={false} />
      <span className="logo__word">Mayoi</span>
    </span>
  );
}
