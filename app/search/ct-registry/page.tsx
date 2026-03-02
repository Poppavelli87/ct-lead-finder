import { CtRegistryForm } from "@/components/ct-registry-form";
import { CtRegistryTable } from "@/components/ct-registry-table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function CtRegistrySearchPage() {
  await requireUser();

  const registryLeads = await db.lead.findMany({
    where: { source: "CT_REGISTRY" },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">CT Business Registry Search</h1>
        <p className="mt-1 text-sm text-slate-600">
          Powered by data.ct.gov Socrata dataset via configured dataset ID in API Hub.
        </p>
      </div>

      <CtRegistryForm />
      <CtRegistryTable
        leads={registryLeads.map((lead) => ({
          id: lead.id,
          name: lead.name,
          city: lead.city,
          industryType: lead.industryType,
          address1: lead.address1,
        }))}
      />
    </div>
  );
}

