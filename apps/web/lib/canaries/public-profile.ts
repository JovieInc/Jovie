/**
 * Public-profile canary assertion helpers.
 *
 * Shared between:
 *  - The Playwright E2E spec (`tests/e2e/canary-public-profile.spec.ts`)
 *  - The daily production cron (`app/api/cron/public-profile-canary/route.ts`)
 *
 * Design rules (JOV-1872):
 *  - Pure functions that operate on typed primitives — no Playwright imports here.
 *  - All assertions are deterministic: given a well-formed response they pass
 *    without environment-specific magic.
 *  - Cron variant is "lightweight HTTP" only; E2E variant exercises the full
 *    browser rendering pipeline.
 */

export const CANARY_CREATOR_HANDLE = 'tim';
export const CANARY_CREATOR_SPOTIFY_ID = '4u';
export const CANARY_AUDIENCE_VISIT_PATH = '/api/audience/visit';

/** Routes under /[handle] that the canary exercises. */
export const CANARY_ROUTES = {
  profile: `/${CANARY_CREATOR_HANDLE}`,
  alerts: `/${CANARY_CREATOR_HANDLE}/alerts`,
  pay: `/${CANARY_CREATOR_HANDLE}/pay`,
} as const;

export type CanaryRouteName = keyof typeof CANARY_ROUTES;

/**
 * Result of a single lightweight HTTP canary check.
 * Used by the cron to build a structured report.
 */
export interface CanaryCheckResult {
  name: string;
  ok: boolean;
  statusCode?: number;
  /** Human-readable detail for failed checks. */
  detail?: string;
  durationMs: number;
}

/**
 * Aggregate result emitted to Sentry / returned from the cron.
 */
export interface CanaryReport {
  /** ISO timestamp of when the run started. */
  runAt: string;
  /** Overall pass/fail. */
  pass: boolean;
  /** Individual check results. */
  checks: CanaryCheckResult[];
  /** Total wall-clock time in ms. */
  totalDurationMs: number;
}

/**
 * Validate that an HTTP status code represents a successful non-redirect response.
 * Pay subroute redirects to `?mode=pay` via 307 — the fetch follows that, so the
 * final response should be 200. The raw 307 is acceptable if `redirect:'follow'`
 * is used.
 */
export function isOkStatus(status: number): boolean {
  return status >= 200 && status < 400;
}

/**
 * Check whether `body` text contains an obvious server error indicator.
 */
export function hasServerError(body: string): boolean {
  const lower = body.toLowerCase();
  return (
    lower.includes('application error') ||
    lower.includes('internal server error') ||
    lower.includes('unhandled runtime error') ||
    lower.includes('this page could not be found')
  );
}

/**
 * Build a minimal audience-visit payload for the canary creator.
 * The profileId is intentionally left blank here — it must be resolved
 * at call-site from the creator's DB record (the cron knows the prod ID;
 * the E2E test uses the dev-seeded ID).
 */
export function buildVisitPayload(profileId: string): Record<string, unknown> {
  return {
    profileId,
    userAgent: 'JovieCanaryBot/1.0 (+https://jov.ie)',
    referrer: null,
    deviceType: 'unknown',
    utmParams: { source: 'canary', medium: 'monitoring' },
  };
}

/**
 * Perform a timed HTTP GET against `url` and return a CanaryCheckResult.
 * Intended for server-side (Node / cron) usage only — not browser.
 */
export async function checkHttpGet(
  name: string,
  url: string,
  expectBodyFn?: (body: string) => boolean
): Promise<CanaryCheckResult> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      redirect: 'follow',
    });
    const durationMs = Date.now() - start;

    if (!isOkStatus(res.status)) {
      return {
        name,
        ok: false,
        statusCode: res.status,
        detail: `HTTP ${res.status}`,
        durationMs,
      };
    }

    const body = await res.text();
    if (hasServerError(body)) {
      return {
        name,
        ok: false,
        statusCode: res.status,
        detail: 'Response body contains server error indicator',
        durationMs,
      };
    }

    if (expectBodyFn) {
      if (!expectBodyFn(body)) {
        return {
          name,
          ok: false,
          statusCode: res.status,
          detail: 'Response body assertion failed',
          durationMs,
        };
      }
    }

    return { name, ok: true, statusCode: res.status, durationMs };
  } catch (err) {
    const durationMs = Date.now() - start;
    return {
      name,
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
      durationMs,
    };
  }
}

/**
 * Perform a timed HTTP POST against `url` and return a CanaryCheckResult.
 */
export async function checkHttpPost(
  name: string,
  url: string,
  body: Record<string, unknown>
): Promise<CanaryCheckResult> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const durationMs = Date.now() - start;

    // 429 is acceptable (rate-limited canary is a healthy system)
    if (!isOkStatus(res.status) && res.status !== 429) {
      return {
        name,
        ok: false,
        statusCode: res.status,
        detail: `HTTP ${res.status}`,
        durationMs,
      };
    }

    return { name, ok: true, statusCode: res.status, durationMs };
  } catch (err) {
    const durationMs = Date.now() - start;
    return {
      name,
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
      durationMs,
    };
  }
}

/**
 * Build a CanaryReport from a list of completed check results.
 */
export function buildReport(
  runAt: string,
  checks: CanaryCheckResult[],
  totalDurationMs: number
): CanaryReport {
  return {
    runAt,
    pass: checks.every(c => c.ok),
    checks,
    totalDurationMs,
  };
}

/**
 * Format a CanaryReport as a structured log summary line.
 */
export function formatReportSummary(report: CanaryReport): string {
  const status = report.pass ? 'PASS' : 'FAIL';
  const failed = report.checks.filter(c => !c.ok).map(c => c.name);
  const failedStr = failed.length > 0 ? ` | failed: ${failed.join(', ')}` : '';
  return `[canary/public-profile] ${status} — ${report.checks.length} checks in ${report.totalDurationMs}ms${failedStr}`;
}
