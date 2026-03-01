import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/leads", label: "Leads" },
  { href: "/search/google", label: "Google Search" },
  { href: "/search/ct-registry", label: "CT Registry" },
  { href: "/enrich/bulk", label: "Bulk Enrich" },
  { href: "/export", label: "Export" },
  { href: "/api-hub", label: "API Hub" },
];

export function Nav({ username }: { username: string }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-8">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-lg font-semibold text-slate-900">
            CT Lead Finder
          </Link>
          <nav className="hidden items-center gap-3 md:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-slate-600 md:inline">{username}</span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Logout
            </button>
          </form>
        </div>
      </div>
      <div className="border-t border-slate-100 px-4 py-2 md:hidden">
        <div className="flex flex-wrap gap-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}

