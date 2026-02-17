import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function requireAuth() {
  if (process.env.ENABLE_DEV_AUTH_BYPASS === "true") {
    return { user: { id: "local-dev-user", role: "admin", email: "localqa@example.com" } } as any;
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session;
}

export function requireRole(role: Role, currentRole?: Role) {
  const rank: Record<Role, number> = { viewer: 0, qa: 1, admin: 2 };
  if (!currentRole || rank[currentRole] < rank[role]) {
    throw new Error("Forbidden");
  }
}
