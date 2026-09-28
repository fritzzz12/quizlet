"use client";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card p-6" role="alert">
      <h1 className="font-display text-3xl">This page hit a problem</h1>
      <p className="mt-2 text-sm text-muted">{error.message || "Try the action again."}</p>
      <button className="btn-secondary mt-4" onClick={reset}>Try again</button>
    </div>
  );
}
