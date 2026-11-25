"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container page center">
      <h1 className="page__title">Something went wrong</h1>
      <p className="empty">{error.message || "Could not load this page."}</p>
      <button className="btn btn--primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
