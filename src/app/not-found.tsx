import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-6 py-20">
      <h1 className="font-display text-5xl">Page not found</h1>
      <p className="mt-3 text-sm text-muted">That link does not match a lesson, quiz, or page in Folio.</p>
      <Link href="/dashboard" className="btn-primary mt-5">Back to dashboard</Link>
    </div>
  );
}
