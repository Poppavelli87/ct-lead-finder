import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { runProviderConnectivityTest } from "@/lib/providers/tests";
import { ProviderSlug } from "@/lib/providers/constants";

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const slug = request.nextUrl.searchParams.get("slug") as ProviderSlug | null;
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  const result = await runProviderConnectivityTest(slug);
  return NextResponse.json(result, {
    status: result.ok ? 200 : (result.statusCode ?? 400),
  });
}

