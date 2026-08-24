import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// ── Protected Page Routes ───────────────────────────────────────────────────
// These are the only application pages that require an authenticated session.
// All public pages (landing, login, auth flows), static assets, and API routes
// (which perform their own internal Node.js session validation) bypass Edge middleware.
const PROTECTED_PAGE_PREFIXES = ['/dashboard', '/accounts', '/security'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtectedPage = PROTECTED_PAGE_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  if (!isProtectedPage) {
    return NextResponse.next();
  }

  // 1. FAST COOKIE INSPECTION (O(1)):
  // Check for presence of NextAuth session token before invoking cryptographic decryption.
  const sessionToken =
    req.cookies.get('__Secure-next-auth.session-token')?.value ||
    req.cookies.get('next-auth.session-token')?.value;

  if (!sessionToken) {
    const loginUrl = new URL('/', req.url);
    loginUrl.searchParams.set('callbackUrl', encodeURIComponent(pathname));
    return NextResponse.redirect(loginUrl);
  }

  // 2. TOKEN VALIDATION:
  // Decrypt and verify the JWT payload using NEXTAUTH_SECRET in Edge runtime
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    const loginUrl = new URL('/', req.url);
    loginUrl.searchParams.set('callbackUrl', encodeURIComponent(pathname));
    return NextResponse.redirect(loginUrl);
  }

  // 3. AUTHORIZED: Pass through request
  return NextResponse.next();
}

// ── Strict Matcher Configuration ─────────────────────────────────────────────
// Strictly match ONLY routes that genuinely require Edge middleware redirects.
// This prevents Edge Middleware from executing on public pages, API routes,
// static assets, images, and fonts — eliminating unnecessary Vercel Edge requests.
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/accounts/:path*',
    '/security/:path*',
  ],
};
