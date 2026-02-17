import { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: Role;
      graphAccessToken?: string;
      graphError?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: Role;
    graphAccessToken?: string;
    graphRefreshToken?: string;
    graphExpiresAt?: number;
    error?: string;
  }
}