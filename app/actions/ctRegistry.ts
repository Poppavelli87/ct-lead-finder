"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { searchCtRegistry } from "@/lib/providers/socrata";
import { ctRegistrySchema } from "@/lib/validation";

export async function runCtRegistrySearchAction(
  _prevState: { message: string },
  formData: FormData,
): Promise<{ message: string }> {
  await requireUser();

  const parsed = ctRegistrySchema.safeParse({
    nameContains: formData.get("nameContains") || undefined,
    city: formData.get("city") || undefined,
    entityType: formData.get("entityType") || undefined,
    filingDateFrom: formData.get("filingDateFrom") || undefined,
    filingDateTo: formData.get("filingDateTo") || undefined,
    newBusinessesOnly: formData.get("newBusinessesOnly") === "on",
    limit: formData.get("limit") || 100,
  });

  if (!parsed.success) {
    return { message: "Invalid CT Registry filters." };
  }

  const result = await searchCtRegistry(parsed.data);
  revalidatePath("/dashboard");
  revalidatePath("/leads");
  revalidatePath("/search/ct-registry");

  return {
    message: `Imported ${result.leads.length} registry leads.`,
  };
}

