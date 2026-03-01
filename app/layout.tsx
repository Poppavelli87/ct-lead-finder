import type { Metadata } from "next";
import "./globals.css";
import { getSessionUser } from "@/lib/auth";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "CT Lead Finder",
  description: "MVP lead finding dashboard for Connecticut businesses",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getSessionUser().catch(() => null);

  return (
    <html lang="en">
      <body className="antialiased">
        {user ? <Nav username={user.username} /> : null}
        <main className="mx-auto max-w-7xl px-4 py-6 md:px-8">{children}</main>
      </body>
    </html>
  );
}

