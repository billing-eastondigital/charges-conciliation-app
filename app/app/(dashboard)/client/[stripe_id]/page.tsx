import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PlanHistoryCard } from "./_components/PlanHistoryCard";
import { ReconHistoryTable } from "./_components/ReconHistoryTable";
import { ClientExceptions } from "./_components/ClientExceptions";
import type { AccountStatus, ReconciliationResult, Exception, ClientRecord } from "@/lib/types";

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

  const supabase = await createClient();

  // Fetch client record + billing plans
  const { data: clientRow } = await supabase
    .from("clients")
    .select("*, client_billing_plans(*)")
    .eq("stripe_id", stripe_id)
    .maybeSingle();

  // Fetch all reconciliation results for this stripe_id
  const { data: resultRows } = await supabase
    .from("reconciliation_results")
    .select("*, clients(accounts)")
    .eq("stripe_id", stripe_id)
    .order("period_label", { ascending: false });

  // Fetch open exceptions for this stripe_id
  const { data: exceptionRows } = await supabase
    .from("exceptions")
    .select("*")
    .eq("stripe_id", stripe_id);

  const reconResults: ReconciliationResult[] = (resultRows ?? []).map((r) => ({
    id: r.id,
    period_label: r.period_label,
    stripe_id: r.stripe_id ?? "",
    display_name: r.display_name ?? "",
    primary_email: r.primary_email ?? "",
    expected_amount: parseFloat(r.expected_amount).toFixed(4),
    collected_amount: parseFloat(r.collected_amount).toFixed(2),
    variance: parseFloat(r.variance).toFixed(4),
    status: r.recon_status as ReconciliationResult["status"],
    batch: (r.batch ?? "—") as ReconciliationResult["batch"],
    constituent_accounts: (r.clients as { accounts: string[] } | null)?.accounts ?? [],
  }));

  const exceptions: Exception[] = (exceptionRows ?? []).map((r) => ({
    id: r.id,
    period_label: r.period_label,
    stripe_id: r.stripe_id ?? null,
    display_name: r.display_name ?? "",
    status: r.resolution_status as Exception["status"],
    reconciliation_status: r.exception_type as Exception["reconciliation_status"],
    variance: r.variance != null ? parseFloat(r.variance).toFixed(4) : "0.0000",
    notes: r.resolution_note ?? null,
    assigned_to: null,
    created_at: r.created_at,
    resolved_at: r.resolved_at ?? null,
  }));

  const clientRecord: ClientRecord | null = clientRow ? {
    stripe_id: clientRow.stripe_id ?? null,
    display_name: clientRow.display_name,
    primary_email: clientRow.primary_email,
    account_status: clientRow.account_status as AccountStatus,
    batch: (clientRow.batch ?? "—") as ClientRecord["batch"],
    google_id: clientRow.google_id ?? null,
    accounts: clientRow.accounts ?? [],
    is_active: clientRow.is_active,
    deactivated_month: clientRow.deactivated_month ?? null,
    start_date: clientRow.start_date ?? null,
    end_date: clientRow.end_date ?? null,
    billing_plans: (clientRow.client_billing_plans ?? [])
      .sort((a: { effective_from: string }, b: { effective_from: string }) =>
        a.effective_from.localeCompare(b.effective_from))
      .map((p: {
        billing_plan: string; billing_details: string | null; billing_pct: number;
        billing_day: number | null; notes: string | null; projection_type: string;
        projection_amount: number | null; manual_overrides: Record<string, number>;
        effective_from: string; effective_to: string | null;
      }) => ({
        billing_plan: p.billing_plan,
        billing_details: p.billing_details ?? null,
        billing_pct: p.billing_pct,
        billing_day: p.billing_day ?? null,
        notes: p.notes ?? null,
        projection_type: p.projection_type as ClientRecord["billing_plans"][number]["projection_type"],
        projection_amount: p.projection_amount ?? null,
        manual_overrides: p.manual_overrides ?? {},
        effective_from: p.effective_from,
        effective_to: p.effective_to ?? null,
      })),
  } : null;

  if (!clientRecord && reconResults.length === 0) notFound();

  const displayName   = clientRecord?.display_name ?? reconResults[0]?.display_name ?? stripe_id;
  const primaryEmail  = clientRecord?.primary_email ?? reconResults[0]?.primary_email ?? "";
  const batch         = clientRecord?.batch ?? reconResults[0]?.batch;
  const accountStatus = clientRecord?.account_status ?? "ACTIVE";

  return (
    <div className="px-6 py-6 space-y-6 max-w-[1200px]">
      {/* Back */}
      <Link
        href="/clients"
        className="inline-flex items-center gap-1.5 text-sm text-[#6b7280] hover:text-[#0170B9] transition-colors"
      >
        <ChevronLeft size={14} />
        Clients
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
