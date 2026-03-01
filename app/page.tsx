import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { ensureBootstrapData } from "@/lib/bootstrap";

export default async function HomePage() {
  await ensureBootstrapData();
  const user = await getSessionUser();

  if (user) {
    redirect("/dashboard");
  }

  redirect("/login");
}

