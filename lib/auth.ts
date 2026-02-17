import { PrismaAdapter } from "@auth/prisma-adapter";
import { NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const useDevBypass = process.env.ENABLE_DEV_AUTH_BYPASS === "true";

async function refreshAccessToken(token: any) {
  try {
    const params = new URLSearchParams({
      client_id: process.env.AZURE_AD_CLIENT_ID ?? "",
      client_secret: process.env.AZURE_AD_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: token.graphRefreshToken,
      scope: process.env.GRAPH_SCOPES ?? "offline_access openid profile User.Read Files.Read Sites.Read.All"
    });

    const response = await fetch(
      `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/oauth2/v2.0/token`,
      { method: "POST", body: params, headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const refreshed = await response.json();
    if (!response.ok) throw refreshed;

    return {
      ...token,
      graphAccessToken: refreshed.access_token,
      graphRefreshToken: refreshed.refresh_token ?? token.graphRefreshToken,
      graphExpiresAt: Date.now() + refreshed.expires_in * 1000
    };
  } catch {
    return { ...token, error: "RefreshAccessTokenError" as const };
  }
}

export const authOptions: NextAuthOptions = {
  adapter: hasDatabase ? PrismaAdapter(prisma) : undefined,
  session: { strategy: "jwt" },
  providers: [
    ...(useDevBypass
      ? [
          CredentialsProvider({
            id: "credentials",
            name: "Demo Login",
            credentials: { email: { label: "Email", type: "text" } },
            async authorize() {
              return {
                id: "local-dev-user",
                email: "localqa@example.com",
                name: "Local QA",
                role: "admin"
              } as any;
            }
          })
        ]
      : []),
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID ?? "",
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? "",
      tenantId: process.env.AZURE_AD_TENANT_ID,
      authorization: {
        params: {
          scope: process.env.GRAPH_SCOPES ?? "openid profile email offline_access User.Read Files.Read Sites.Read.All"
        }
      }
    })
  ],
  callbacks: {
    async signIn() {
      return true;
    },
    async jwt({ token, user, account }) {
      if ((user as any)?.role) {
        token.role = (user as any).role;
      }
      if (hasDatabase && user?.id) {
        const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
        token.role = dbUser?.role ?? "viewer";
      }

      if (account) {
        token.graphAccessToken = account.access_token;
        token.graphRefreshToken = account.refresh_token;
        token.graphExpiresAt = account.expires_at ? account.expires_at * 1000 : Date.now() + 3600 * 1000;
      }

      if (token.graphExpiresAt && Date.now() < token.graphExpiresAt - 60_000) return token;
      if (!token.graphRefreshToken) return token;
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.role = (token.role as any) ?? "viewer";
        session.user.graphAccessToken = token.graphAccessToken as string | undefined;
        session.user.graphError = token.error as string | undefined;
      }
      return session;
    }
  },
  pages: {
    signIn: "/"
  }
};
