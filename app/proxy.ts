import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE = "app-session";
const LOGIN_PATH = "/login";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow login page and its POST action
  if (pathname === LOGIN_PATH) return NextResponse.next();

  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next(); // no password set → open

  const session = req.cookies.get(COOKIE)?.value;
  if (session === password) return NextResponse.next();

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = LOGIN_PATH;
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
