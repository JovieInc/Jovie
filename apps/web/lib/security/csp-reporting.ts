/**
 * CSP Violation Reporting Configuration
 *
 * Enables Content Security Policy violation reporting to Sentry.
 * Uses report-only mode to capture violations without blocking resources.
 *
 * @see https://docs.sentry.io/platforms/javascript/security-policy-reporting/
 */

import { publicEnv } from '@/lib/env-public';

/**
 * Parses a Sentry DSN to extract components needed for CSP reporting.
 *
 * DSN format: https://<public_key>@<org>.ingest.<region>.sentry.io/<project_id>
 *
 * @param dsn - The Sentry DSN string
 * @returns Parsed components or null if invalid
 */
export function parseSentryDsn(dsn: string): {
  publicKey: string;
  host: string;
  projectId: string;
} | null {
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const host = url.host;
    const projectId = url.pathname.replace('/', '');

    if (!publicKey || !host || !projectId) {
      return null;
    }

    return { publicKey, host, projectId };
  } catch {
    return null;
  }
}

/**
 * Builds the Sentry CSP report URI from a DSN.
 *
 * @param dsn - The Sentry DSN string
 * @returns The CSP report URI or null if DSN is invalid
 */
export function buildCspReportUri(dsn: string): string | null {
  const parsed = parseSentryDsn(dsn);
  if (!parsed) {
    return null;
  }

  const { publicKey, host, projectId } = parsed;
  return `https://${host}/api/${projectId}/security/?sentry_key=${publicKey}`;
}

/**
 * Gets the CSP report URI from environment variables.
 * Falls back to generating from DSN if explicit URI not provided.
 *
 * @returns The CSP report URI or null if not configured
 */
export function getCspReportUri(): string | null {
  // Prefer explicit URI if provided
  const explicitUri = publicEnv.NEXT_PUBLIC_SENTRY_CSP_REPORT_URI;
  if (explicitUri) {
    return explicitUri;
  }

  // Fall back to generating from DSN
  const dsn = publicEnv.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    return null;
  }

  return buildCspReportUri(dsn);
}

/**
 * Report-To header group name for CSP reporting.
 */
export const CSP_REPORT_GROUP = 'csp-endpoint';

/**
 * Builds the Report-To header value for CSP reporting.
 *
 * @param reportUri - The CSP report endpoint URL
 * @returns The Report-To header value as a JSON string
 */
export function buildReportToHeader(reportUri: string): string {
  const config = {
    group: CSP_REPORT_GROUP,
    max_age: 10886400, // 126 days
    endpoints: [{ url: reportUri }],
  };

  return JSON.stringify(config);
}

/**
 * Builds the Reporting-Endpoints header value for CSP reporting.
 * This is the newer format that's replacing Report-To.
 *
 * @param reportUri - The CSP report endpoint URL
 * @returns The Reporting-Endpoints header value
 */
export function buildReportingEndpointsHeader(reportUri: string): string {
  return `${CSP_REPORT_GROUP}="${reportUri}"`;
}
