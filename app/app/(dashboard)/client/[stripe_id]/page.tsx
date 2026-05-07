import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { clientDatabase } from "@/lib/mock/client-database";
import { april2026Results } from "@/lib/mock/april-2026";
import { april2026Exceptions } from "@/lib/mock/exceptions";
import { PlanHistoryCard } from "./_components/PlanHistoryCard";
import { ReconHistoryTable } from "./_components/ReconHistoryTable";
import { ClientExceptions } from "./_components/ClientExceptions";
import type { AccountStatus } from "@/lib/types";

function AccountStatusBadge({ status }: { status: AccountStatus }) {
  const map: Record<AccountStatus, string> = {
    ACTIVE:   "bg-green-100 text-green-800 border-green-200",
    LOST:     "bg-gray-100 text-gray-600 border-gray-200",
    INACTIVE: "bg-amber-100 text-amber-800 border-amber-200",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded-sm ${map[status]}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

interface Props {
  params: Promise<{ stripe_id: string }>;
}

export default async function ClientPage({ params }: Props) {
  const { stripe_id } = await params;

  const clientRecord   = clientDatabase.find((c) => c.stripe_id === stripe_id) ?? null;
  const reconResults   = april2026Results.filter((r) => r.stripe_id === stripe_id);
  const exceptions     = april2026Exceptions.filter((e) => e.stripe_id === stripe_id);

  if (!clientRecord && reconResults.length === 0) notFound();

  const displayName   = clientRecord?.display_name ?? reconResults[0]?.display_name ?? stripe_id;
  const primaryEmail  = clientRecord?.primary_email ?? reconResults[0]?.primary_email ?? "";
  const batch         = clientRecord?.batch ?? reconResults[0]?.batch;
  const accountStatus = clientRecord?.account_status ?? "ACTIVE";

  return (
    <div className="px-6 py-6 space-y-6 max-w-[1200px]">
      {/* Back */}
      <Link
        href="/period/April%202026"
        className="inline-flex items-center gap-1.5 text-sm text-[#6b7280] hover:text-[#0170B9] transition-colors"
      >
        <ChevronLeft size={14} />
        April 2026
      </Link>

      {/* Header card */}
      <div className="bg-white border border-[#dddddd] rounded-sm px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-[#3a3a3a]">{displayName}</h1>
            <p className="text-sm text-[#6b7280]">{primaryEmail}</p>
            {clientRecord && clientRecord.accounts.length > 1 && (
              <p className="text-xs text-[#4B4F58] mt-1">
                {clientRecord.accounts.join(" · ")}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 items-center justify-end shrink-0">
            {batch && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-sm border border-[#dddddd] bg-[#F5F5F5] text-[#4B4F58]">
                Batch {batch}
              </span>
            )}
            <AccountStatusBadge status={accountStatus} />
          </div>
        </div>

        {/* Metadata strip */}
        <div className="mt-4 pt-4 border-t border-[#dddddd] flex flex-wrap gap-x-6 gap-y-2 text-xs text-[#6b7280]">
          <span>
            <span className="font-medium text-[#3a3a3a]">Stripe ID</span>{" "}
            <code className="font-mono">{stripe_id}</code>
          </span>
          {clientRecord?.google_id && (
            <span>
              <span className="font-medium text-[#3a3a3a]">Google ID</span>{" "}
              <code className="font-mono">{clientRecord.google_id}</code>
            </span>
          )}
          {clientRecord?.start_date && (
            <span>
              <span className="font-medium text-[#3a3a3a]">Client since</span>{" "}
              {clientRecord.start_date}
            </span>
          )}
          {clientRecord?.deactivated_month && (
            <span className="text-amber-700 font-medium">
              Deactivated {clientRecord.deactivated_month}
            </span>
          )}
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-3 gap-5 items-start">
        {/* Left col: recon history + exceptions */}
        <div className="col-span-2 space-y-5">
          <ReconHistoryTable results={reconResults} />
          {exceptions.length > 0 && <ClientExceptions exceptions={exceptions} />}
        </div>

        {/* Right col: billing plan */}
        <div className="col-span-1">
          {clientRecord ? (
            <PlanHistoryCard plans={clientRecord.billing_plans} />
          ) : (
            <div className="bg-white border border-[#dddddd] rounded-sm px-5 py-4">
              <p className="text-sm text-[#6b7280]">
                No record in the billing database for this Stripe ID.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
