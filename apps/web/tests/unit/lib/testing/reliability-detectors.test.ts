import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  nightlyPlaywrightConfigIncludesCanarySpecs,
  RELIABILITY_DETECTORS,
  validateReliabilityDetectorArtifacts,
} from '@/lib/testing/reliability-detectors';

const repoRoot = resolve(process.cwd(), '../..');

describe('reliability detector registry (JOV-1855)', () => {
  it('registers every child-issue detector in the loop', () => {
    const ids = RELIABILITY_DETECTORS.map(detector => detector.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'public-profile-canary',
        'auth-signup-onboarding-canary',
        'bug-to-test-rule',
        'flaky-quarantine-ledger',
        'nightly-testing-agent',
      ])
    );
  });

  it('requires all registered artifacts to exist on disk', () => {
    const result = validateReliabilityDetectorArtifacts(path =>
      existsSync(resolve(repoRoot, path))
    );

    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true);
  });

  it('wires canary E2E specs into nightly Playwright config', () => {
    const nightlyConfigPath = resolve(
      process.cwd(),
      'playwright.config.nightly.ts'
    );
    const source = readFileSync(nightlyConfigPath, 'utf8');

    expect(nightlyPlaywrightConfigIncludesCanarySpecs(source)).toBe(true);
    expect(source).toContain('./lib/testing/reliability-detectors');
    expect(source).toContain('...RELIABILITY_CANARY_E2E_GLOBS');
  });

  it('fails validation when a detector artifact is missing', () => {
    const result = validateReliabilityDetectorArtifacts(() => false);
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('fails when nightly config omits canary spec globs', () => {
    expect(
      nightlyPlaywrightConfigIncludesCanarySpecs(
        "testMatch: ['**/nightly/**/*.spec.ts']"
      )
    ).toBe(false);
  });

  it('ignores canary globs that only appear outside root testMatch', () => {
    expect(
      nightlyPlaywrightConfigIncludesCanarySpecs(`
        // **/canary-public-profile.spec.ts and **/canary-auth-signup-onboarding.spec.ts
        import { RELIABILITY_CANARY_E2E_GLOBS } from './lib/testing/reliability-detectors';
        export default defineConfig({
          testMatch: ['**/nightly/**/*.spec.ts'],
        });
      `)
    ).toBe(false);
  });
});
