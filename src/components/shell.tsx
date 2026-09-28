"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { UserProfile } from "@/lib/types";
import { AppProviders } from "@/components/ui";

const LINKS = [
  { href: "/dashboard", label: "Home" },
  { href: "/lessons", label: "Lessons" },
  { href: "/quizzes", label: "Quizzes" },
  { href: "/history", label: "History" },
  { href: "/study", label: "Saved" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AppProviders>
      <ShellFrame>{children}</ShellFrame>
    </AppProviders>
  );
}

function ShellFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    api<{ user: UserProfile }>("/api/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => router.push("/login"));
  }, [router]);

  async function signOut() {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="hidden bg-navy text-white md:flex md:min-h-screen md:flex-col md:justify-between md:px-5 md:py-6">
        <div>
          <Link href="/dashboard" className="font-display text-3xl">Folio</Link>
          <p className="mt-1 text-sm text-white/70">Study only what you uploaded.</p>
          <nav className="mt-8 space-y-1" aria-label="Primary">
            {LINKS.map((link) => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link key={link.href} href={link.href} className={`block rounded-2xl px-3 py-2 text-sm font-semibold ${active ? "bg-white text-navy" : "text-white/80 hover:bg-white/10"}`}>
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="space-y-2 text-sm">
          <Link href="/profile" className="block rounded-2xl px-3 py-2 text-white/80 hover:bg-white/10">Profile</Link>
          <Link href="/settings" className="block rounded-2xl px-3 py-2 text-white/80 hover:bg-white/10">Settings</Link>
          <button className="w-full rounded-2xl px-3 py-2 text-left text-white/80 hover:bg-white/10" onClick={signOut}>Sign out</button>
          {user ? <p className="px-3 pt-2 text-xs text-white/50">{user.name}</p> : null}
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex items-center justify-between px-4 py-4 md:hidden">
          <Link href="/dashboard" className="font-display text-3xl">Folio</Link>
          <Link href="/profile" className="text-sm font-semibold text-navy">{user?.name || "Account"}</Link>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-2 md:px-8 md:pb-10 md:pt-8">{children}</main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-card/95 px-2 py-2 backdrop-blur md:hidden" aria-label="Primary">
        {LINKS.map((link) => {
          const active = pathname === link.href || (link.href !== "/dashboard" && pathname.startsWith(`${link.href}/`));
          return (
            <Link key={link.href} href={link.href} className={`rounded-2xl px-1 py-2 text-center text-[11px] font-semibold ${active ? "bg-navy text-white" : "text-muted"}`}>
              {link.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
