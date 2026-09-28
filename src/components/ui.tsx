"use client";

import { createContext, useContext, useState } from "react";

type ConfirmOptions = { title: string; body: string; confirmLabel?: string; danger?: boolean };

const ToastContext = createContext<(message: string) => void>(() => undefined);
const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(async () => false);

export function useToast() {
  return useContext(ToastContext);
}

export function useConfirm() {
  return useContext(ConfirmContext);
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<(ConfirmOptions & { resolve: (value: boolean) => void }) | null>(null);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 3200);
  }

  function ask(options: ConfirmOptions) {
    return new Promise<boolean>((resolve) => setConfirm({ ...options, resolve }));
  }

  return (
    <ToastContext.Provider value={notify}>
      <ConfirmContext.Provider value={ask}>
        {children}
        {toast ? (
          <div className="fixed bottom-20 right-4 z-50 max-w-sm rounded-2xl bg-navy px-4 py-3 text-sm text-white shadow-card md:bottom-6" role="status">
            {toast}
          </div>
        ) : null}
        {confirm ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <div className="card w-full max-w-md p-6">
              <h2 id="confirm-title" className="font-display text-2xl text-ink">
                {confirm.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">{confirm.body}</p>
              <div className="mt-6 flex justify-end gap-2">
                <button className="btn-ghost" onClick={() => { confirm.resolve(false); setConfirm(null); }}>
                  Cancel
                </button>
                <button
                  className={confirm.danger ? "btn-danger" : "btn-primary"}
                  onClick={() => { confirm.resolve(true); setConfirm(null); }}
                >
                  {confirm.confirmLabel || "Confirm"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-40 items-center gap-3 text-sm text-muted" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card border-bad/30 p-6" role="alert">
      <h2 className="font-display text-2xl">Something needs attention</h2>
      <p className="mt-2 text-sm leading-6 text-muted">{message}</p>
      {onRetry ? (
        <button className="btn-secondary mt-4" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="card border-dashed p-8 text-center">
      <h2 className="font-display text-3xl">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted">
        <span>{label}</span>
        <span>{Math.round(width)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(width)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full bg-teal" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function ScoreDisplay({ score, total, percentage }: { score: number; total: number; percentage: number }) {
  return (
    <div className="card flex flex-col items-start gap-2 p-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Score</p>
        <p className="font-display text-5xl text-ink">
          {score} <span className="text-3xl text-muted">/ {total}</span>
        </p>
      </div>
      <p className="font-display text-4xl text-accent">{percentage}%</p>
    </div>
  );
}

export function PageHeader({ eyebrow, title, body, action }: { eyebrow?: string; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">{eyebrow}</p> : null}
        <h1 className="font-display text-4xl tracking-tight text-ink sm:text-5xl">{title}</h1>
        {body ? <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{body}</p> : null}
      </div>
      {action}
    </div>
  );
}
