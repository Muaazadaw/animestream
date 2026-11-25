import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container page center">
      <h1 className="page__title">Not found</h1>
      <p className="empty">That page or anime doesn’t exist.</p>
      <Link className="btn btn--primary" href="/">
        Back home
      </Link>
    </div>
  );
}
