/**
 * Auth-degraded HTML fallback for middleware 503 paths.
 *
 * Returns a minimal, standalone HTML page that matches the visual tone of
 * the existing AuthUnavailableCard (/signin auth-unavailable state).
 *
 * This module runs in the Edge middleware context (proxy.ts) where React/JSX
 * is not available — all output is plain HTML strings.
 *
 * No dangerouslySetInnerHTML. No user-controlled data interpolated.
 */

const DEGRADED_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow" />
    <title>Service temporarily unavailable — Jovie</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      html, body {
        min-height: 100%;
        background: #06070a;
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      body {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem 1.25rem;
        min-height: 100svh;
      }
      .card {
        width: 100%;
        max-width: 30rem;
        text-align: center;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        border: 1px solid rgba(255,255,255,0.1);
        background: rgba(255,255,255,0.04);
        border-radius: 9999px;
        padding: 0.375rem 0.75rem;
        font-size: 0.75rem;
        font-weight: 500;
        letter-spacing: -0.012em;
        color: rgba(255,255,255,0.7);
        margin-bottom: 1.5rem;
      }
      .badge-dot {
        width: 0.375rem;
        height: 0.375rem;
        border-radius: 50%;
        background: rgba(255,255,255,0.55);
        flex-shrink: 0;
      }
      h1 {
        font-size: clamp(2.2rem, 5.5vw, 3.5rem);
        font-weight: 590;
        line-height: 0.92;
        letter-spacing: -0.06em;
        color: #fff;
        margin-bottom: 1rem;
      }
      p {
        font-size: 0.96rem;
        line-height: 1.65;
        letter-spacing: -0.014em;
        color: rgba(255,255,255,0.6);
        max-width: 26rem;
        margin: 0 auto 0.5rem;
      }
      .footer-note {
        margin-top: 1.5rem;
        font-size: 0.75rem;
        line-height: 1.6;
        letter-spacing: -0.01em;
        color: rgba(255,255,255,0.4);
      }
      .btn {
        display: inline-flex;
        min-height: 3.75rem;
        align-items: center;
        justify-content: center;
        border-radius: 9999px;
        border: 1px solid rgba(255,255,255,0.1);
        background: #fff;
        padding: 0 1.5rem;
        font-size: 0.9375rem;
        font-weight: 590;
        letter-spacing: -0.02em;
        color: #06070a;
        text-decoration: none;
        margin-top: 1.5rem;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="badge">
        <span class="badge-dot" aria-hidden="true"></span>
        Auth unavailable
      </div>
      <h1>Sign in is temporarily unavailable</h1>
      <p>This is usually brief — please try again in a moment.</p>
      <p class="footer-note">If it still does not work, give it a moment and try again.</p>
      <a href="/" class="btn">Go to Homepage</a>
    </div>
  </body>
</html>`;

/**
 * Returns a 503 HTML response for browser navigation (Accept: text/html).
 * Reuse this whenever proxy.ts needs to surface an auth-degraded state
 * to a real browser request.
 */
export function buildAuthDegradedHtmlResponse(): Response {
  return new Response(DEGRADED_HTML, {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Retry-After': '5',
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Returns true if the request's Accept header indicates a browser navigation
 * (i.e., the caller expects an HTML document).
 *
 * API/fetch requests typically send Accept: application/json or
 * Accept: * which do NOT include text/html as a preferred type.
 */
export function isBrowserNavigation(acceptHeader: string | null): boolean {
  if (!acceptHeader) return false;
  return acceptHeader.includes('text/html');
}
