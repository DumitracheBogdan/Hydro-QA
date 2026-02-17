"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { FolderKanban, Bug, TestTube2, Gauge, ShieldCheck, LogOut, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/test-cases", label: "Repository", icon: TestTube2 },
  { href: "/plans", label: "Test Plans", icon: FolderKanban },
  { href: "/test-runs", label: "Test Runs", icon: ShieldCheck },
  { href: "/bugs", label: "Bugs", icon: Bug },
  { href: "/reports", label: "Reports", icon: FileText }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data } = useSession();
  const demoMode = process.env.NEXT_PUBLIC_ENABLE_DEV_AUTH_BYPASS === "true";

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[260px_1fr]">
      <aside className="border-r border-[#c2dff6] bg-white/95 p-4 backdrop-blur">
        <div className="mb-6 rounded-2xl bg-gradient-to-br from-[#3a99e1] to-[#1c2d86] p-4 text-white shadow-lg">
          <Image src="/hydrocert-logo.svg" alt="Hydrocert" width={180} height={36} className="h-auto w-auto" />
          <p className="mt-2 text-xs text-blue-100">QA Pro Tracker</p>
        </div>
        <nav className="space-y-1">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                pathname.startsWith(href)
                  ? "bg-[#ebf5fc] text-[#1c2d86]"
                  : "text-slate-600 hover:bg-[#f2f8fe] hover:text-[#18405f]"
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </Link>
          ))}
        </nav>
        <button
          className="mt-8 flex w-full items-center gap-2 rounded-xl border border-[#c2dff6] bg-white px-3 py-2.5 text-sm font-medium text-[#1c2d86] hover:bg-[#ebf5fc]"
          onClick={() => signOut({ callbackUrl: "/" })}
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </aside>
      <main className="p-4 lg:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#c2dff6] bg-white p-3 shadow-sm">
          <div>
            <p className="text-xs uppercase tracking-wider text-[#358bcd]">Logged in as</p>
            <p className="text-sm font-semibold text-[#1c2d86]">
              {demoMode ? "localqa@example.com (admin-demo)" : `${data?.user?.email} (${data?.user?.role})`}
            </p>
          </div>
          <input
            className="h-10 w-full max-w-xs rounded-xl border border-[#c2dff6] bg-[#f7fbff] px-3 text-sm outline-none ring-0 placeholder:text-slate-400 focus:border-[#3a99e1]"
            placeholder="Global search (title, tag, defect, case)"
          />
        </div>
        {children}
      </main>
    </div>
  );
}
