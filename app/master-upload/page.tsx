import { MasterUploadForm } from "@/components/master-upload-form";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function MasterUploadPage() {
  await requireUser();

  const total = await db.masterRecord.count();
  const recent = await db.masterRecord.findMany({
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Master List Dedupe</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage the canonical master list used to skip duplicate enrichment calls.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm text-slate-700">
          Total master keys: <span className="font-semibold text-slate-900">{total}</span>
        </div>
      </div>

      <MasterUploadForm />

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-900">Recent Keys</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">Phone</th>
                <th className="px-2 py-2">Website</th>
                <th className="px-2 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((record) => (
                <tr key={record.id} className="border-b border-slate-100 text-slate-700">
                  <td className="px-2 py-2">{record.name || "-"}</td>
                  <td className="px-2 py-2">{record.phone || "-"}</td>
                  <td className="px-2 py-2">{record.website || "-"}</td>
                  <td className="px-2 py-2">{record.createdAt.toISOString().slice(0, 19).replace("T", " ")}</td>
                </tr>
              ))}
              {!recent.length ? (
                <tr>
                  <td className="px-2 py-4 text-slate-500" colSpan={4}>
                    No master records yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
