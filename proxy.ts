import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  return response;
}

export const config = {
  matcher: [
    // Run on all routes except api routes, auth callback, static assets,
    // and common image files. /auth/callback must not be intercepted —
    // the callback runs its own session exchange.
    "/((?!api|auth|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
