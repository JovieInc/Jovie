import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * JOV-6585 boundary contract: the browser telemetry entrypoints that ship on
 * public-profile routes must never pull server-only analytics, database
 * clients, or privileged tool implementations into client bundles.
 *
 * Mirrors the pac-events-client-boundary pattern: byte-level assertions over
 * the client import graph roots. The server-boundary ESLint config remains
 * the broader net; this pins the telemetry graph specifically.
 */
const TELEMETRY_CLIENT_SOURCES = [
  'lib/analytics.ts',
  'lib/tracking/consent.ts',
  'lib/tracking/json-beacon.ts',
  'lib/tracking/google-consent-mode.ts',
  'lib/tracking/navigation-telemetry.ts',
  'lib/tracking/navigation-telemetry-contract.ts',
  'lib/tracking/pac-events.ts',
  'lib/tracking/pac-events-shared.ts',
  'lib/monitoring/web-vitals.ts',
  'components/providers/Analytics.tsx',
  'components/providers/GoogleAnalytics.tsx',
] as const;

const FORBIDDEN_CLIENT_IMPORTS = [
  'server-only',
  '@/lib/db',
  'drizzle-orm',
  '@/lib/env-server',
  'next/headers',
  'next/cache',
  '@/lib/flags/statsig',
  '@upstash/redis',
  '@upstash/ratelimit',
  'stripe',
  'clerk',
  'lib/ingestion',
] as const;

function readWebSource(sourcePath: string): string {
  return readFileSync(resolve(process.cwd(), sourcePath), 'utf8');
}

describe('telemetry client boundary (JOV-6585)', () => {
  it('keeps every browser telemetry entrypoint free of server-only imports', () => {
    for (const sourcePath of TELEMETRY_CLIENT_SOURCES) {
      const source = readWebSource(sourcePath);
      for (const forbiddenImport of FORBIDDEN_CLIENT_IMPORTS) {
        expect(
          source,
          `${sourcePath} must not import ${forbiddenImport}`
        ).not.toContain(forbiddenImport);
      }
    }
  });

  it('keeps the gtag wrapper non-awaiting — track() is fire-and-forget', () => {
    const source = readWebSource('lib/analytics.ts');
    expect(source).toContain('if (!analyticsWindow?.gtag) return;');
    expect(source).not.toContain('await');
  });

  it('keeps the beacon transport non-blocking — no await on the primary path', () => {
    const source = readWebSource('lib/tracking/json-beacon.ts');
    // fetch is fire-and-forget with .catch; postJsonBeacon returns a boolean
    // synchronously and callers never await a response.
    expect(source).toContain('.catch(');
    expect(source).not.toContain('await fetch');
    expect(source).not.toContain('await navigator.sendBeacon');
  });

  it('bounds navigation telemetry buffers — batch size is capped', () => {
    const contract = readWebSource(
      'lib/tracking/navigation-telemetry-contract.ts'
    );
    expect(contract).toContain('NAVIGATION_TELEMETRY_MAX_BATCH_SIZE = 8');
  });

  it('preserves consent gating and data-minimization in the shared tracking helpers', () => {
    const consent = readWebSource('lib/tracking/consent.ts');
    // GPC/DNT signals keep precedence; analytics consent stays explicit-choice.
    expect(consent).toContain('isGPCEnabled()');
    expect(consent).toContain('isDNTEnabled()');

    const navigation = readWebSource('lib/tracking/navigation-telemetry.ts');
    // No consent -> zero telemetry events (never a partial write).
    expect(navigation).toContain('isAnalyticsAllowed()');
  });
});
