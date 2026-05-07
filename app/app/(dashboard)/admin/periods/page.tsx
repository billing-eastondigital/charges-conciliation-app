import { clientDatabase } from "@/lib/mock/client-database";
import { PlanManagerTable } from "./_components/PlanManagerTable";

export default function AdminPeriodsPage() {
  return (
    <div className="px-6 py-6 space-y-5 max-w-[1480px]">
      <div>
        <h1 className="text-2xl font-semibold text-[#3a3a3a]">Plan Management</h1>
        <p className="text-sm text-[#6b7280] mt-0.5">
          View and update billing plans for all clients.
        </p>
      </div>
      <PlanManagerTable initialClients={clientDatabase} />
    </div>
  );
}
