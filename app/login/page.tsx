import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions/auth";
import { getSessionUser } from "@/lib/auth";
import { ensureBootstrapData } from "@/lib/bootstrap";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await ensureBootstrapData();
  const user = await getSessionUser();
  if (user) {
    redirect("/dashboard");
  }

  const resolvedSearch = await searchParams;
  const error = typeof resolvedSearch.error === "string" ? resolvedSearch.error : null;

  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-semibold text-slate-900">CT Lead Finder Login</h1>
      <p className="mt-2 text-sm text-slate-600">Single-admin sign in for local operations.</p>

      {error ? (
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      ) : null}

      <form action={loginAction} className="mt-6 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            name="username"
            defaultValue="admin"
            className="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
            required
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-slate-900 px-4 py-2 font-medium text-white transition hover:bg-slate-700"
        >
          Sign In
        </button>
      </form>
    </div>
  );
}

