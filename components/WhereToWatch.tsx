import type { ExternalLink } from "@/lib/anilist";

/** Official streaming links AniList knows about for a show. */
export default function WhereToWatch({ links }: { links: ExternalLink[] }) {
  const streams = links.filter((l) => l.type === "STREAMING");
  if (streams.length === 0) return null;
  return (
    <div className="where">
      <h3>Where to watch officially</h3>
      <div className="where__links">
        {streams.map((l) => (
          <a
            key={l.url}
            href={l.url}
            target="_blank"
            rel="noreferrer"
            className="where__link"
            style={{ borderColor: l.color ?? undefined }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {l.icon ? <img src={l.icon} alt="" width={18} height={18} /> : null}
            {l.site}
          </a>
        ))}
      </div>
    </div>
  );
}
