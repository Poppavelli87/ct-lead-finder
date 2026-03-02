import { fetchPhoneFromPlaceId } from "../lib/providers/google";
import { PROVIDER_SLUGS } from "../lib/providers/constants";
import { getProviderSecret } from "../lib/providers/request";

async function main() {
  const placeId = (process.argv[2] ?? "ChIJN1t_tDeuEmsRUsoyG83frY4").trim();
  const envKey = (process.env.GOOGLE_API_KEY ?? "").trim();
  const storedKey = (await getProviderSecret(PROVIDER_SLUGS.GOOGLE))?.trim() ?? "";
  const apiKey = envKey || storedKey;

  if (!apiKey) {
    throw new Error("Missing Google API key. Set GOOGLE_API_KEY or save key in API Hub.");
  }

  const { phone } = await fetchPhoneFromPlaceId(placeId, apiKey);
  console.log(JSON.stringify({ placeId, phone }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Smoke test failed");
  process.exit(1);
});
