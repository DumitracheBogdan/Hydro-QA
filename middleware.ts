import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const publicPaths = ["/", "/api", "/report"];
const devBypass = process.env.ENABLE_DEV_AUTH_BYPASS === "true";

export async function middleware(req: NextRequest) {
  if (devBypass) return NextResponse.next();
  if (publicPaths.some((path) => req.nextUrl.pathname.startsWith(path))) return NextResponse.next();
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    const url = new URL("/", req.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
