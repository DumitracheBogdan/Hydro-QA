import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function getSession() {
  return getServerSession(authOptions);
}

export async function getGraphAccessToken() {
  const session = await getSession();
  return session?.user?.graphAccessToken;
}
