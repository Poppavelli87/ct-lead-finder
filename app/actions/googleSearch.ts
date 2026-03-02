"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { runGoogleProgressiveSearch } from "@/lib/providers/google";
import { googleSearchSchema } from "@/lib/validation";

export async function runGoogleSearchAction(
  _prevState: { message: string },
  formData: FormData,
): Promise<{ message: string }> {
  await requireUser();

  const parsed = googleSearchSchema.safeParse({
    businessType: formData.get("businessType"),
    county: formData.get("county") || undefined,
    city: formData.get("city") || undefined,
    zip: formData.get("zip") || undefined,
    progressive: formData.get("progressive") === "on",
    targetCount: formData.get("targetCount") || 100,
  });

  if (!parsed.success) {
    return { message: "Invalid search input." };
  }

  const result = await runGoogleProgressiveSearch(parsed.data);
  revalidatePath("/dashboard");
  revalidatePath("/leads");
  revalidatePath("/search/google");

  return {
    message: `Saved ${result.saved.length} leads. Skipped ${result.skippedForLowPrequal} low-score and ${result.skippedForMasterDedupe} master-dedupe candidates.`,
  };
}

