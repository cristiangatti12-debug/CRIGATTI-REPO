import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Bump this string to fire a fresh one-time wipe across all devices.
// Cookie-gated so a device only sees the wipe once per version.
const SW_RESET_COOKIE = "vela_swreset_v1";

// Next.js 16: this file (formerly middleware.ts) refreshes the Supabase session
// cookie on every navigation so that auth.getUser() never returns null inside
// the app once a user has signed in. Without it, the cookie is never renewed
// and users silently fall out of session mid-flow.
//
// Canonical @supabase/ssr pattern: write cookies to BOTH request and response,
// re-create the response object whenever cookies change, then call getUser()
// so the SDK refreshes the JWT when expired.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Must be called — this is what triggers the JWT refresh.
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isLogin = path === "/login";

  // Unauthenticated user on a protected page → send to /login.
  if (!user && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Authenticated user revisiting /login → bounce home.
  if (user && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // ── One-time service worker + cache wipe ────────────────────────────────
  // Some Android (Samsung Internet) and old iOS Safari PWAs still have a
  // pre-d164349 service worker installed that intercepts every request and
  // surfaces as "Impossibile caricare la pagina". The unregister script in
  // app/layout.tsx only runs after the HTML loads, which the broken SW
  // blocks. Clear-Site-Data lets the SERVER force the browser to wipe its
  // local SW + cache + storage. We gate on a cookie so a device only gets
  // wiped once per version.
  if (!request.cookies.has(SW_RESET_COOKIE)) {
    response.headers.set("Clear-Site-Data", '"cache", "storage", "executionContexts"');
    response.cookies.set(SW_RESET_COOKIE, "done", {
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: "/",
      sameSite: "lax",
    });
  }

  return response;
}

export const config = {
  matcher: [
    // Run on all routes except api routes, auth callback, static assets,
    // and public root files (sw.js, manifest.json, reset.html, images).
    // /auth/callback must not be intercepted — the callback runs its own
    // session exchange. sw.js / manifest.json must not redirect to /login
    // or the browser fails SW registration and PWA manifest parsing, which
    // surfaces in some browsers as "Impossibile caricare la pagina".
    // reset.html is the self-recovery page for stuck devices — must work
    // even when the user isn't signed in.
    "/((?!api|auth|_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.json|reset\\.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest|txt|xml)$).*)",
  ],
};
