"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { enrichLeadWithGoogle } from "@/lib/providers/google";

export async function enrichLeadNowAction(formData: FormData): Promise<void> {
  await requireUser();
  const leadId = String(formData.get("leadId") ?? "").trim();
  if (!leadId) return;

  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) return;

  await enrichLeadWithGoogle(lead);
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/dashboard");
}

export async function enrichSelectedWithGoogleAction(formData: FormData): Promise<void> {
  await requireUser();
  const ids = formData
    .getAll("leadId")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (!ids.length) {
    return;
  }

  const leads = await db.lead.findMany({
    where: {
      id: { in: ids },
    },
  });

  for (const lead of leads) {
    await enrichLeadWithGoogle(lead);
  }

  revalidatePath("/leads");
  revalidatePath("/search/ct-registry");
  revalidatePath("/dashboard");
}

