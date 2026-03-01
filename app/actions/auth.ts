"use server";

import { redirect } from "next/navigation";
import { authenticateAdmin, clearAuthSession, setAuthSession } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";

export async function loginAction(formData: FormData): Promise<void> {
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect("/login?error=Invalid+input");
  }

  const user = await authenticateAdmin(parsed.data.username, parsed.data.password);

  if (!user) {
    redirect("/login?error=Invalid+credentials");
  }

  await setAuthSession(user);
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await clearAuthSession();
  redirect("/login");
}

