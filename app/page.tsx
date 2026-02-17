"use client";

import { useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  const { status } = useSession();
  if (status === "authenticated") redirect("/dashboard");
  const useDevBypass = process.env.NEXT_PUBLIC_ENABLE_DEV_AUTH_BYPASS === "true";
  useEffect(() => {
    if (useDevBypass) {
      window.location.href = "/dashboard";
    }
  }, [useDevBypass]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border bg-white p-6 shadow-xl">
        <h1 className="text-2xl font-bold">QA Pro Tracker</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in with Microsoft Entra ID to manage quality operations.</p>
        {useDevBypass ? (
          <Button className="mt-6 w-full" onClick={() => (window.location.href = "/dashboard")}>
            Intra direct in Demo
          </Button>
        ) : (
          <Button className="mt-6 w-full" onClick={() => signIn("azure-ad", { callbackUrl: "/dashboard" })}>
            Continue with Microsoft
          </Button>
        )}
      </div>
    </div>
  );
}
