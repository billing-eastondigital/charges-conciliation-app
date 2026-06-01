import { createClient } from "@/lib/supabase/server";
import BillingImportClient from "./_components/BillingImportClient";
import StripeImportClient from "./_components/StripeImportClient";

export default async function ImportPage() {
  const supabase = await createClient();

  const { data: periodsRows } = await supabase
    .from("periods")
    .select("period_label, is_closed")
    .order("start_date", { ascending: false });

  const periods = (periodsRows ?? []).map((p) => ({
    period_label: p.period_label,
    is_closed:    p.is_closed,
  }));

  const functionsUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(".supabase.co", ".supabase.co/functions/v1") ??
    "https://unogorchezflktiweebg.supabase.co/functions/v1";

  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVub2dvcmNoZXpmbGt0aXdlZWJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MTgwNzYsImV4cCI6MjA5NDA5NDA3Nn0.4S3dM3Zl3nYdGLvSkKVESJRbWJwEy29byUXuc13PvcA";

  return (
    <div className="px-6 py-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold text-[#3a3a3a]">Import Billing Sheet</h1>
        <p className="text-sm text-[#6b7280] mt-0.5">
          Upload the monthly AR billing xlsx to populate expected charges for a period.
          The file is parsed in your browser — only the extracted data is sent to the server.
        </p>
      </div>

      {/* How it works */}
      <div className="bg-[#F5F5F5] border border-[#dddddd] rounded-sm px-5 py-4">
        <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-3">How it works</p>
        <ol className="space-y-1.5 text-sm text-[#4B4F58] list-decimal list-inside">
          <li>Select the target period below</li>
          <li>Upload the billing xlsx — columns are auto-detected from the headers</li>
          <li>Review the preview and verify totals match your source file</li>
          <li>Click Import — existing AR lines for the period are replaced</li>
        </ol>
      </div>

      <BillingImportClient
        periods={periods}
        supabaseFunctionsUrl={functionsUrl}
        supabaseAnonKey={anonKey}
      />

      {/* ── Stripe Charges Sync ─────────────────────────────────────────── */}
      <div>
        <h2 className="text-base font-semibold text-[#3a3a3a]">Sync Stripe Charges</h2>
        <p className="text-sm text-[#6b7280] mt-0.5">
          Pull charges directly from the Stripe API for a period. Existing charges are updated
          in place — running this multiple times is safe.
        </p>
      </div>

      <div className="bg-[#F5F5F5] border border-[#dddddd] rounded-sm px-5 py-4">
        <p className="text-xs font-semibold text-[#6b7280] uppercase tracking-wide mb-3">How it works</p>
        <ol className="space-y-1.5 text-sm text-[#4B4F58] list-decimal list-inside">
          <li>Select the period and which Stripe account(s) to pull from</li>
          <li>The function fetches all charges within the period window from the Stripe API</li>
          <li>Each charge is classified (PAID_NET / FAILED_HARD / REFUNDED / FAILED_RETRY)</li>
          <li>Results are upserted into the database — existing rows are updated, not duplicated</li>
        </ol>
      </div>

      <StripeImportClient
        periods={periods}
        supabaseFunctionsUrl={functionsUrl}
        supabaseAnonKey={anonKey}
      />
    </div>
  );
}
