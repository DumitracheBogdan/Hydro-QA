import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  if (process.env.ENABLE_DEV_AUTH_BYPASS === "true") {
    return <AppShell>{children}</AppShell>;
  }
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/");
  return <AppShell>{children}</AppShell>;
}
