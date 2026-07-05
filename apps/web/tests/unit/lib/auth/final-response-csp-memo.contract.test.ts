import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guardrail: getCspReportUri() must be resolved once at module load in
 * final-response.ts so nonce requests do not re-parse the Sentry DSN.
 * csp-reporting.ts intentionally stays un-memoized for env-mutation tests.
 */
describe('final-response CSP report URI memoization (#10992)', () => {
  const source = readFileSync(
    join(process.cwd(), 'lib/auth/final-response.ts'),
    'utf8'
  );

  it('caches getCspReportUri at module scope', () => {
    expect(source).toMatch(/const CSP_REPORT_URI = getCspReportUri\(\);/);
  });

  it('uses the cached URI inside buildFinalResponse instead of re-calling getCspReportUri', () => {
    const buildFnStart = source.indexOf('export function buildFinalResponse');
    expect(buildFnStart).toBeGreaterThan(-1);
    const buildFnBody = source.slice(buildFnStart);
    expect(buildFnBody).toContain('CSP_REPORT_URI');
    expect(buildFnBody).not.toContain('getCspReportUri()');
  });
});
