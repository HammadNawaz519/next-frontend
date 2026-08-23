import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// ── Protected Route Definitions ──────────────────────────────────────────────
// Dynamic routes that strictly require an active session
const PROTECTED_PAGE_PREFIXES = ['/dashboard', '/accounts', '/security'];

// API routes that strictly require authentication (excluding public auth endpoints)
const PROTECTED_API_PREFIXES = [
  '/api/chat',
  '/api/user',
  '/api/change-password',
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtectedPage = PROTECTED_PAGE_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
  const isProtectedApi = PROTECTED_API_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  // 1. FAST-PATH PASS-THROUGH:
  // If request is not for a protected page or protected API, pass through immediately.
  // This ensures public pages, landing sheets, and unauthenticated APIs incur 0 compute overhead.
  if (!isProtectedPage && !isProtectedApi) {
    return NextResponse.next();
  }

  // 2. FAST COOKIE INSPECTION (O(1)):
  // Check for presence of NextAuth session token before invoking cryptographic decryption.
  const sessionToken =
    req.cookies.get('__Secure-next-auth.session-token')?.value ||
    req.cookies.get('next-auth.session-token')?.value;

  if (!sessionToken) {
    if (isProtectedApi) {
      return NextResponse.json(
        { error: 'Unauthorized: Authentication required.' },
        { status: 401 }
      );
    }

    // Redirect unauthenticated user to login page with preserved callback URL
    const loginUrl = new URL('/', req.url);
    loginUrl.searchParams.set('callbackUrl', encodeURIComponent(pathname));
    return NextResponse.redirect(loginUrl);
  }

  // 3. TOKEN VALIDATION:
  // Decrypt and verify the JWT payload using NEXTAUTH_SECRET in Edge runtime
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    if (isProtectedApi) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or expired session.' },
        { status: 401 }
      );
    }

    const loginUrl = new URL('/', req.url);
    loginUrl.searchParams.set('callbackUrl', encodeURIComponent(pathname));
    return NextResponse.redirect(loginUrl);
  }

  // 4. AUTHORIZED: Pass through request
  return NextResponse.next();
}

// ── Strict Matcher Configuration ──────────────────────────────────────────────
export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * 1. Next.js internal static assets & optimization endpoints:
     *    - _next/static (static chunks, css, scripts)
     *    - _next/image (image optimization queries)
     * 2. NextAuth core endpoints (OAuth callback, session, csrf):
     *    - api/auth
     * 3. Metadata, manifest & service worker files:
     *    - favicon.ico, sitemap.xml, robots.txt, manifest.json, site.webmanifest, sw.js
     * 4. Static media, fonts, and assets in /public or subdirectories:
     *    - Images: .svg, .png, .jpg, .jpeg, .gif, .webp, .ico, .avif
     *    - Styles & Scripts: .css, .js, .map, .json
     *    - Fonts: .woff, .woff2, .ttf, .eot, .otf
     *    - Audio / Video: .mp3, .mp4, .webm, .wav, .ogg
     *    - Documents: .pdf, .txt, .xml
     */
    '/((?!_next/static|_next/image|api/auth|favicon\\.ico|sitemap\\.xml|robots\\.txt|manifest\\.json|site\\.webmanifest|sw\\.js|apple-touch-icon.*\\.png|icon.*\\.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|map|json|woff|woff2|ttf|eot|otf|mp3|mp4|webm|wav|ogg|pdf|txt|xml)$).*)',
  ],
};
