import { db } from "./db";
import { dedupeAndSaveLead } from "./dedupe";
import { findMasterRecordByIdentity } from "./master-dedupe";
import { googleResolverFromName, inferDomain } from "./providers/google";
import { enrichCompanyByDomain } from "./providers/genericEnrich";
import { lookupRdapDomain } from "./providers/rdap";
import { extractWebsiteSignals } from "./website-extract";

const JOB_STATUS = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;

const JOB_ROW_STATUS = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  ENRICHED: "ENRICHED",
  FAILED: "FAILED",
  SKIPPED: "SKIPPED",
} as const;

type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];
type JobRowStatus = (typeof JOB_ROW_STATUS)[keyof typeof JOB_ROW_STATUS];

export type RowMapping = {
  name: string;
  website?: string;
  city?: string;
  county?: string;
  phone?: string;
  address?: string;
  email?: string;
};

function mapValue(row: Record<string, unknown>, key?: string): string | null {
  if (!key) return null;
  const value = row[key];
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function parseMapping(job: any): RowMapping {
  const mapping = (job.mapping ?? {}) as Record<string, unknown>;
  return {
    name: typeof mapping.name === "string" ? mapping.name : "name",
    website: typeof mapping.website === "string" ? mapping.website : undefined,
    city: typeof mapping.city === "string" ? mapping.city : undefined,
    county: typeof mapping.county === "string" ? mapping.county : undefined,
    phone: typeof mapping.phone === "string" ? mapping.phone : undefined,
    address: typeof mapping.address === "string" ? mapping.address : undefined,
    email: typeof mapping.email === "string" ? mapping.email : undefined,
  };
}

async function processRow(job: any, row: any, mapping: RowMapping): Promise<{ status: JobRowStatus }> {
  const original = (row.originalData ?? {}) as Record<string, unknown>;
  const name = mapValue(original, mapping.name);

  if (!name) {
    await db.jobRow.update({
      where: { id: row.id },
      data: {
        status: JOB_ROW_STATUS.SKIPPED,
        error: "Missing mapped business name",
      },
    });
    return { status: JOB_ROW_STATUS.SKIPPED };
  }

  const city = mapValue(original, mapping.city);
  const county = mapValue(original, mapping.county);
  const phone = mapValue(original, mapping.phone);
  const website = mapValue(original, mapping.website);

  const masterMatch = await findMasterRecordByIdentity({
    name,
    phone,
    website,
  });

  let lead = masterMatch ? null : await googleResolverFromName(name, city, county, job.id);
  const pass1Data = masterMatch
    ? {
        resolvedWith: "master_dedupe",
        leadId: null,
        masterRecordId: masterMatch.id,
      }
    : {
        resolvedWith: "google",
        leadId: lead?.id ?? null,
      };

  if (!lead) {
    lead = await dedupeAndSaveLead({
      source: "UPLOAD",
      name,
      website,
      city,
      county,
      phone,
      email: mapValue(original, mapping.email),
      address1: mapValue(original, mapping.address),
      state: "CT",
    });
  }

  const effectiveWebsite = lead.website || website;
  const pass2 = await extractWebsiteSignals(effectiveWebsite);

  const updatedLead = await db.lead.update({
    where: { id: lead.id },
    data: {
      phone: lead.phone || pass2.phone,
      email: lead.email || pass2.email,
      address1: lead.address1 || pass2.address,
      lastEnrichedAt: new Date(),
    },
  });

  const pass2Data = {
    website: effectiveWebsite,
    extractedPhone: pass2.phone,
    extractedEmail: pass2.email,
    extractedAddress: pass2.address,
  };

  let pass3Data: Record<string, unknown> = {
    directoryLookup: "placeholder",
    found: false,
  };

  const domain = inferDomain(updatedLead);
  if (domain) {
    const [rdap, generic] = await Promise.all([lookupRdapDomain(domain), enrichCompanyByDomain(domain)]);
    pass3Data = {
      directoryLookup: "placeholder",
      found: Boolean(rdap || generic),
      rdapRegistrar: rdap?.registrar ?? null,
      rdapCreatedDate: rdap?.createdDate ?? null,
      genericOwnerName: generic?.ownerName ?? null,
      genericSocialLinks: generic?.socialLinks ?? null,
    };

    if (generic?.ownerName || generic?.socialLinks) {
      await db.lead.update({
        where: { id: updatedLead.id },
        data: {
          ownerName: generic.ownerName ?? updatedLead.ownerName,
          socialLinks: generic.socialLinks ?? updatedLead.socialLinks,
        } as any,
      });
    }
  }

  const finalData = {
    lead_id: updatedLead.id,
    name: updatedLead.name,
    phone: updatedLead.phone,
    email: updatedLead.email,
    website: updatedLead.website,
    address: updatedLead.address1,
    city: updatedLead.city,
    county: updatedLead.county,
    qualified: updatedLead.qualified,
    qualification_score: updatedLead.qualificationScore,
  };

  await db.jobRow.update({
    where: { id: row.id },
    data: {
      leadId: updatedLead.id,
      status: JOB_ROW_STATUS.ENRICHED,
      pass1Data,
      pass2Data,
      pass3Data,
      finalData,
      error: null,
    } as any,
  });

  return { status: JOB_ROW_STATUS.ENRICHED };
}

export async function processEnrichmentJobChunk(jobId: string, chunkSize = 10): Promise<{
  jobId: string;
  status: JobStatus;
  processedRows: number;
  totalRows: number;
  successRows: number;
  failedRows: number;
}> {
  const job = await db.enrichmentJob.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new Error("Job not found");
  }

  if (job.status === JOB_STATUS.COMPLETED || job.status === JOB_STATUS.FAILED) {
    return {
      jobId,
      status: job.status,
      processedRows: job.processedRows,
      totalRows: job.totalRows,
      successRows: job.successRows,
      failedRows: job.failedRows,
    };
  }

  if (job.status === JOB_STATUS.PENDING) {
    await db.enrichmentJob.update({
      where: { id: jobId },
      data: {
        status: JOB_STATUS.RUNNING,
        startedAt: new Date(),
      },
    });
  }

  const mapping = parseMapping(job);
  const rows = await db.jobRow.findMany({
    where: { jobId, status: JOB_ROW_STATUS.PENDING },
    orderBy: { rowIndex: "asc" },
    take: chunkSize,
  });

  for (const row of rows) {
    await db.jobRow.update({
      where: { id: row.id },
      data: { status: JOB_ROW_STATUS.PROCESSING },
    });

    try {
      await processRow(job, row, mapping);
    } catch (error) {
      await db.jobRow.update({
        where: { id: row.id },
        data: {
          status: JOB_ROW_STATUS.FAILED,
          error: error instanceof Error ? error.message.slice(0, 2000) : "Row processing failed",
        },
      });
    }
  }

  const counts = await db.jobRow.groupBy({
    by: ["status"],
    where: { jobId },
    _count: { _all: true },
  });

  const statusCount = Object.fromEntries(counts.map((item: any) => [item.status, item._count._all]));
  const processedRows =
    (statusCount[JOB_ROW_STATUS.ENRICHED] ?? 0) +
    (statusCount[JOB_ROW_STATUS.SKIPPED] ?? 0) +
    (statusCount[JOB_ROW_STATUS.FAILED] ?? 0);
  const successRows = (statusCount[JOB_ROW_STATUS.ENRICHED] ?? 0) + (statusCount[JOB_ROW_STATUS.SKIPPED] ?? 0);
  const failedRows = statusCount[JOB_ROW_STATUS.FAILED] ?? 0;
  const pendingLeft = (statusCount[JOB_ROW_STATUS.PENDING] ?? 0) + (statusCount[JOB_ROW_STATUS.PROCESSING] ?? 0);

  const newStatus = pendingLeft === 0 ? JOB_STATUS.COMPLETED : JOB_STATUS.RUNNING;

  const updatedJob = await db.enrichmentJob.update({
    where: { id: jobId },
    data: {
      status: newStatus,
      processedRows,
      successRows,
      failedRows,
      finishedAt: newStatus === JOB_STATUS.COMPLETED ? new Date() : null,
    },
  });

  return {
    jobId,
    status: updatedJob.status,
    processedRows: updatedJob.processedRows,
    totalRows: updatedJob.totalRows,
    successRows: updatedJob.successRows,
    failedRows: updatedJob.failedRows,
  };
}
