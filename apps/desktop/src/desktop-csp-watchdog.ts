import type { Session } from 'electron';
import type { DesktopSecurityReporter } from './desktop-security-reporting';

const ENFORCING_CSP_HEADER_NAME = 'content-security-policy';

// Both header names must be deleted before injecting the fallback (browsers
// intersect multiple CSP headers), but only the enforcing header is evaluated.
const CSP_HEADER_NAMES = [
  ENFORCING_CSP_HEADER_NAME,
  'content-security-policy-report-only',
] as const;

const MINIMUM_SHELL_CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
] as const;

export const SHELL_FALLBACK_CSP = MINIMUM_SHELL_CSP_DIRECTIVES.join('; ');

function getHeaderValue(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | null {
  // Electron's `details.responseHeaders` preserves the origin server's header
  // casing (and it varies by HTTP version / proxy), so a direct `headers[name]`
  // lookup with a fixed-case key silently misses a present header. Match the
  // key case-insensitively. (JOV-3835: a missed lowercase `content-security-policy`
  // made the watchdog inject a restrictive fallback CSP that the browser
  // intersected with the real policy, blocking every nonce'd script → blank app.)
  const lowerName = name.toLowerCase();
  const matchKey = Object.keys(headers).find(
    key => key.toLowerCase() === lowerName
  );
  const value = matchKey === undefined ? undefined : headers[matchKey];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (Array.isArray(value)) {
    const joined = value.find(entry => entry.trim().length > 0);
    return joined ?? null;
  }

  return null;
}

function hasMinimumShellCspPolicy(policy: string): boolean {
  const normalized = policy.toLowerCase();
  return MINIMUM_SHELL_CSP_DIRECTIVES.every(directive =>
    normalized.includes(directive.toLowerCase())
  );
}

export function evaluateTrustedOriginCspHeaders(input: {
  readonly responseHeaders: Record<string, string | string[] | undefined>;
}): 'present' | 'missing' | 'weakened' {
  // Only the enforcing header counts. A `content-security-policy-report-only`
  // header is advisory: it must neither satisfy the minimum check (a response
  // with ONLY report-only runs with zero enforced CSP — exactly the misconfig
  // this watchdog exists to catch) nor fail it (a divergent report-only policy
  // alongside a strong enforcing policy must not nuke the enforcing header and
  // trigger fallback injection).
  const policy = getHeaderValue(
    input.responseHeaders,
    ENFORCING_CSP_HEADER_NAME
  );

  if (policy === null) {
    return 'missing';
  }

  if (hasMinimumShellCspPolicy(policy)) {
    return 'present';
  }

  return 'weakened';
}

export function installDesktopCspWatchdog(input: {
  readonly session: Session;
  readonly appOrigin: string;
  readonly report: DesktopSecurityReporter;
}): void {
  input.session.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType !== 'mainFrame') {
      callback({ cancel: false });
      return;
    }

    let responseUrl: URL;
    try {
      responseUrl = new URL(details.url);
    } catch {
      callback({ cancel: false });
      return;
    }

    if (responseUrl.origin !== input.appOrigin) {
      callback({ cancel: false });
      return;
    }

    // Redirects (3xx) and error responses carry no CSP header and no body to
    // protect; evaluating them floods telemetry with false 'missing' positives
    // and injects a pointless fallback onto a bodiless response.
    if (
      typeof details.statusCode !== 'number' ||
      details.statusCode < 200 ||
      details.statusCode >= 300
    ) {
      callback({ cancel: false });
      return;
    }

    const headers = { ...details.responseHeaders };
    const status = evaluateTrustedOriginCspHeaders({
      responseHeaders: headers,
    });

    if (status === 'missing' || status === 'weakened') {
      input.report(
        status === 'missing' ? 'csp-header-missing' : 'csp-header-weakened',
        responseUrl.pathname
      );
      // Drop any existing CSP header (any casing) before injecting the fallback.
      // Browsers enforce the INTERSECTION of multiple CSP headers, so leaving a
      // stale (possibly differently-cased) policy alongside the fallback would
      // over-restrict the page. Replace, don't stack.
      const cspHeaderNames: readonly string[] = CSP_HEADER_NAMES;
      for (const key of Object.keys(headers)) {
        if (cspHeaderNames.includes(key.toLowerCase())) {
          delete headers[key];
        }
      }
      headers['Content-Security-Policy'] = [SHELL_FALLBACK_CSP];
      callback({ cancel: false, responseHeaders: headers });
      return;
    }

    callback({ cancel: false });
  });
}
