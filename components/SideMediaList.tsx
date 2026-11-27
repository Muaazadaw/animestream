import Link from "next/link";
import { prettyEnum, statusDot } from "@/lib/anilist";
import { Icon } from "./Menu";

export type SideMedia = {
  id: number;
  title: string;
  cover: string | null;
  banner: string | null;
  format: string | null;
  status: string | null;
  year: number | null;
  episodes: number | null;
  /** 0–100 */
  score: number | null;
  /** "Side story", "Spin off"… for related entries. */
  relation?: string | null;
};

/** A titled sidebar list of shows (Related, Recommendations) with cover, meta and a faded banner. */
export default function SideMediaList({ title, items }: { title: string; items: SideMedia[] }) {
  if (items.length === 0) return null;
  return (
    <section className="sidelist">
      <h2>
        <Icon name="next" size={14} /> {title}
      </h2>
      <div className="sidelist__items">
        {items.map((m) => (
          <Link key={m.id} href={`/anime/${m.id}`} className="sidelist__item">
            {m.banner ? <span className="sidelist__bg" style={{ backgroundImage: `url(${m.banner})` }} /> : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.cover ?? undefined} alt="" loading="lazy" />
            <span className="sidelist__body">
              <span className="sidelist__title">
                <i className={`dot ${statusDot(m.status)}`} />
                {m.title}
              </span>
              <span className="sidelist__meta">
                {m.relation ? <em>{m.relation}</em> : null}
                {m.format ? <span>{prettyEnum(m.format)}</span> : null}
                {m.year ? <span>{m.year}</span> : null}
                {m.episodes ? (
                  <span>
                    <Icon name="cc" size={11} /> {m.episodes}
                  </span>
                ) : null}
                {m.score ? <span>★ {m.score}</span> : null}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
