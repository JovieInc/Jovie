import {
  type NextRequest,
  type NextResponse,
  NextResponse as NextResponseCtor,
} from 'next/server';

import { decodeFapiHostFromPublishableKey } from '@/lib/auth/decode-fapi-host';
import { resolveClerkKeys } from '@/lib/auth/staging-clerk-keys';
import { captureError } from '@/lib/error-tracking';

/**
 * Clerk FAPI proxy handler — dedicated helper extracted from proxy.ts.
 *
 * fetch-based proxy using the hostname-resolved Clerk publishable key.
 * Staging and production use different Clerk instances, so the FAPI host
 * must be decoded from the active host's key at runtime.
 * We use fetch() because NextResponse.rewrite() and vercel.json rewrites
 * forward the original Host header, causing Clerk to return 400 "Invalid host".
 *
 * No behavior change — exact logic preserved.
 */
export async function handleClerkFapiProxy(
  req: NextRequest
): Promise<NextResponse | null> {
  const pathname = req.nextUrl.pathname;
  const hostname = req.nextUrl.hostname;

  if (
    !pathname.startsWith('/__clerk/') &&
    pathname !== '/__clerk' &&
    !pathname.startsWith('/clerk/') &&
    pathname !== '/clerk'
  ) {
    return null;
  }

  // Resolve the FAPI host from the active publishable key. Staging and
  // production live on different Clerk instances (different keys), so the
  // host MUST be decoded at runtime — never hardcoded.
  // See: .claude/rules/auth.md → Clerk Auth Proxy Architecture.
  const pk = resolveClerkKeys(hostname).publishableKey;
  const fapiHost = decodeFapiHostFromPublishableKey(pk);
  if (!fapiHost) {
    // This path is always an API/JS fetch (/__clerk is the FAPI proxy,
    // never a direct browser navigation), so always return JSON here.
    return NextResponseCtor.json(
      {
        error: 'Clerk proxy unavailable: missing or invalid publishable key',
      },
      { status: 503 }
    );
  }

  const subpath = pathname.replace(/^\/__clerk\/?|^\/clerk\/?/, '');
  const targetUrl = `https://${fapiHost}/${subpath}${req.nextUrl.search}`;

  let body: ArrayBuffer | null = null;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      body = await req.arrayBuffer();
    } catch {
      // empty body
    }
  }

  // Build clean headers — only forward what Clerk needs.
  // Do NOT set `host` (fetch sets it from URL; manual setting is rejected by
  // Edge fetch on POST bodies in some undici builds) or `content-length`
  // (undici computes from body; manual override throws TypeError on POST).
  // This was the root cause of Apple OAuth `response_mode=form_post` callbacks
  // 502'ing while Google's GET callbacks worked.
  const headers = new Headers();
  headers.set('origin', `https://${fapiHost}`);
  const ct = req.headers.get('content-type');
  if (ct) headers.set('content-type', ct);
  const accept = req.headers.get('accept');
  if (accept) headers.set('accept', accept);
  const cookie = req.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  const ua = req.headers.get('user-agent');
  if (ua) headers.set('user-agent', ua);
  const auth = req.headers.get('authorization');
  if (auth) headers.set('authorization', auth);
  // Forward Referer ONLY for OAuth callback paths — Apple's form_post chain
  // sets it to https://appleid.apple.com and FAPI may use it to validate the
  // callback. Other Clerk endpoints don't need it; keep blast radius small.
  if (pathname.includes('/oauth_callback')) {
    const referer = req.headers.get('referer');
    if (referer) headers.set('referer', referer);
  }

  try {
    const proxyRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
      redirect: 'manual',
    });

    // Streaming a raw 3xx Response with a non-null body through Next.js
    // middleware on Vercel Edge crashes the runtime *before* this try/catch
    // can intercept (surfaces as opaque "500 Internal Server Error"). Use
    // NextResponse.redirect for redirects — the only middleware-supported
    // redirect primitive — and forward Set-Cookie headers explicitly.
    const isRedirect = proxyRes.status >= 300 && proxyRes.status < 400;
    const upstreamLocation = proxyRes.headers.get('location');

    if (isRedirect && upstreamLocation) {
      const fapiOrigin = `https://${fapiHost}`;
      // NextResponse.redirect requires an absolute URL. Clerk FAPI can
      // return three kinds of Location headers during OAuth:
      //   1. Absolute FAPI URL (https://clerk.jov.ie/v1/...) — route through
      //      our /__clerk proxy so cookies and CSP stay scoped to our origin.
      //   2. FAPI-relative path (/v1/...) — Apple's intra-FAPI redirects do
      //      this. Resolve it against our /__clerk proxy origin so the
      //      browser follows it through the proxy.
      //   3. Absolute non-FAPI URL (https://other.example/...) — third-party
      //      OAuth provider redirects. Pass through unchanged.
      let rewrittenLocation: string;
      if (upstreamLocation.startsWith(fapiOrigin)) {
        rewrittenLocation = upstreamLocation.replace(
          fapiOrigin,
          `${req.nextUrl.origin}/__clerk`
        );
      } else if (upstreamLocation.startsWith('/')) {
        rewrittenLocation = `${req.nextUrl.origin}/__clerk${upstreamLocation}`;
      } else {
        rewrittenLocation = upstreamLocation;
      }

      const redirectStatus = proxyRes.status as 301 | 302 | 303 | 307 | 308;
      const redirect = NextResponseCtor.redirect(
        rewrittenLocation,
        redirectStatus
      );

      const setCookies =
        proxyRes.headers.getSetCookie?.() ??
        proxyRes.headers.get('set-cookie')?.split(/,(?=[^;]+=)/) ??
        [];
      for (const cookie of setCookies) {
        if (cookie) redirect.headers.append('set-cookie', cookie);
      }

      return redirect;
    }

    const resHeaders = new Headers(proxyRes.headers);
    resHeaders.delete('content-encoding');

    return new NextResponseCtor(proxyRes.body, {
      status: proxyRes.status,
      statusText: proxyRes.statusText,
      headers: resHeaders,
    });
  } catch (err) {
    const errName = err instanceof Error ? err.name : 'UnknownError';
    const errMessage = err instanceof Error ? err.message : String(err);
    await captureError('[clerk-proxy] fetch failed', err, {
      pathname,
      hostname,
      context: 'clerk_proxy_fetch',
      errName,
      errMessage,
      method: req.method,
    });
    return NextResponseCtor.json(
      {
        error: 'Clerk proxy error',
        code: errName,
        hint: errMessage,
      },
      { status: 502 }
    );
  }
}
