"use client";

import { useState } from "react";

/** YouTube trailer that only loads the iframe once clicked. */
export default function Trailer({ youtubeId, title }: { youtubeId: string; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="row">
      <div className="row__head">
        <h2>Trailer</h2>
      </div>
      <div className="trailer">
        {open ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0`}
            title={`${title} trailer`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <button
            className="trailer__poster"
            style={{ backgroundImage: `url(https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg)` }}
            onClick={() => setOpen(true)}
            aria-label="Play trailer"
          >
            <span className="trailer__play">▶</span>
          </button>
        )}
      </div>
    </section>
  );
}
