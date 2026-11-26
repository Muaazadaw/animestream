// Shown while the watch page gathers episode lists: the page's shape, so it
// doesn't feel like a blank wait.
export default function WatchLoading() {
  return (
    <div className="watch container" aria-busy="true" aria-label="Loading episode">
      <div className="skel skel--line" style={{ width: 220, marginBottom: 14 }} />
      <div className="watch__layout">
        <div className="watch__main">
          <div className="player skel skel--player">
            <div className="spinner" />
          </div>
          <div className="skel skel--line" style={{ width: 160, marginTop: 18 }} />
          <div className="skel skel--title" />
          <div className="skel-row">
            {[40, 40, 92, 112, 40].map((w, i) => (
              <div key={i} className="skel skel--btn" style={{ width: w }} />
            ))}
          </div>
        </div>
        <aside className="side">
          <div className="episodes">
            <div className="skel skel--line" style={{ width: "60%" }} />
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="skel skel--ep" />
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
