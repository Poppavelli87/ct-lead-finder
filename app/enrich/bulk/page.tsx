import Link from "next/link";
import { saveJobMappingAction } from "@/app/actions/jobs";
import { JobRunner } from "@/components/job-runner";
import { UploadJobForm } from "@/components/upload-job-form";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function BulkEnrichPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();

  const params = await searchParams;
  const selectedJobId = typeof params.jobId === "string" ? params.jobId : undefined;

  const jobs = await db.enrichmentJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 15,
  });

  const activeJob = selectedJobId
    ? await db.enrichmentJob.findUnique({ where: { id: selectedJobId } })
    : jobs[0] || null;

  const headers = ((activeJob?.sourceHeaders ?? []) as string[]) || [];
  const mapping = ((activeJob?.mapping ?? {}) as Record<string, string>) || {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">PURPLE V2 Bulk Enrichment</h1>
        <p className="mt-1 text-sm text-slate-600">
          3-pass resolver ladder: Google resolver, website extraction (robots-aware), directory placeholder.
        </p>
      </div>

      <UploadJobForm />

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-900">Jobs</h2>
          <div className="mt-3 space-y-2">
            {jobs.map((job) => (
              <Link
                key={job.id}
                href={`/enrich/bulk?jobId=${job.id}`}
                className={`block rounded-md border px-3 py-2 text-sm ${
                  activeJob?.id === job.id
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                <div className="font-medium">{job.id.slice(0, 12)}...</div>
                <div>{job.status}</div>
                <div>
                  {job.processedRows}/{job.totalRows}
                </div>
              </Link>
            ))}
            {!jobs.length ? <div className="text-sm text-slate-500">No jobs yet.</div> : null}
          </div>
        </aside>

        <div className="space-y-4">
          {activeJob ? (
            <>
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="font-semibold text-slate-900">Column Mapping</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Map your columns before running the job. Required: business name.
                </p>
                <form action={saveJobMappingAction} className="mt-4 grid gap-3 md:grid-cols-2">
                  <input type="hidden" name="jobId" value={activeJob.id} />
                  <MappingSelect label="Name" name="name" headers={headers} defaultValue={mapping.name} required />
                  <MappingSelect label="Website" name="website" headers={headers} defaultValue={mapping.website} />
                  <MappingSelect label="City" name="city" headers={headers} defaultValue={mapping.city} />
                  <MappingSelect label="County" name="county" headers={headers} defaultValue={mapping.county} />
                  <MappingSelect label="Phone" name="phone" headers={headers} defaultValue={mapping.phone} />
                  <MappingSelect label="Address" name="address" headers={headers} defaultValue={mapping.address} />
                  <MappingSelect label="Email" name="email" headers={headers} defaultValue={mapping.email} />
                  <button
                    type="submit"
                    className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
                  >
                    Save Mapping
                  </button>
                </form>
              </section>

              <JobRunner jobId={activeJob.id} />
            </>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
              Upload a file to create your first enrichment job.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MappingSelect({
  label,
  name,
  headers,
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  headers: string[];
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-slate-700">
      {label}
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        className="rounded-md border border-slate-300 px-3 py-2"
      >
        <option value="">Unmapped</option>
        {headers.map((header) => (
          <option key={`${name}-${header}`} value={header}>
            {header}
          </option>
        ))}
      </select>
    </label>
  );
}

