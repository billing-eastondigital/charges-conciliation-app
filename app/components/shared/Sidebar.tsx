"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertCircle,
  BarChart3,
  Calendar,
  CreditCard,
  FileText,
  Settings,
  Table2,
  TrendingUp,
  Upload,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CURRENT_PERIOD } from "@/lib/mock";

const NAV_ITEMS = [
  {
    label: "Period",
    href: `/period/April 2026`,
    icon: Calendar,
    match: "/period",
  },
  {
    label: "Exceptions",
    href: "/exceptions",
    icon: AlertCircle,
    match: "/exceptions",
  },
  {
    label: "Annual",
    href: "/annual/2026",
    icon: BarChart3,
    match: "/annual",
  },
  {
    label: "Budget",
    href: "/budget/2026",
    icon: TrendingUp,
    match: "/budget",
  },
  {
    label: "Clients",
    href: "/clients",
    icon: Users,
    match: "/clients",
  },
  {
    label: "Audit",
    href: `/audit/${encodeURIComponent(CURRENT_PERIOD)}`,
    icon: FileText,
    match: "/audit",
  },
  {
    label: "Billing",
    href: "/billing",
    icon: Table2,
    match: "/billing",
  },
  {
    label: "Stripe",
    href: "/stripe",
    icon: CreditCard,
    match: "/stripe",
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 bg-white border-r border-[#dddddd] flex flex-col min-h-screen">
      {/* Logo / brand */}
      <div className="px-5 py-4 border-b border-[#dddddd]">
        <span className="text-[#0170B9] font-semibold text-sm tracking-wide uppercase">
          Easton Digital
        </span>
        <p className="text-[11px] text-[#6b7280] mt-0.5">Reconciliation</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ label, href, icon: Icon, match }) => {
          const active = pathname.startsWith(match);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-sm text-sm transition-colors",
                active
                  ? "bg-[#0170B9] text-white"
                  : "text-[#4B4F58] hover:bg-[#F5F5F5] hover:text-[#3a3a3a]"
              )}
            >
              <Icon size={16} strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Admin links */}
      <div className="px-3 py-4 border-t border-[#dddddd] space-y-0.5">
        <Link
          href="/admin/import"
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-sm text-sm transition-colors",
            pathname.startsWith("/admin/import")
              ? "bg-[#0170B9] text-white"
              : "text-[#6b7280] hover:bg-[#F5F5F5] hover:text-[#3a3a3a]"
          )}
        >
          <Upload size={16} strokeWidth={1.75} />
          Import
        </Link>
        <Link
          href="/admin/periods"
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-sm text-sm transition-colors",
            pathname.startsWith("/admin/periods")
              ? "bg-[#0170B9] text-white"
              : "text-[#6b7280] hover:bg-[#F5F5F5] hover:text-[#3a3a3a]"
          )}
        >
          <Settings size={16} strokeWidth={1.75} />
          Admin
        </Link>
      </div>
    </aside>
  );
}
