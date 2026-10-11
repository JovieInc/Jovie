import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// JOV-INV-019 follow-up: smartlink-release-screen-proof.spec.ts and
// smartlink-track-screen-proof.spec.ts were added to
// tests/product-screenshots/ in #19417 but never added to
// playwright.config.screenshots.ts's testMatch allowlist. That allowlist
// filters even an explicit CLI file path (not just a bare `playwright test`
// run), so both producers silently reported "No tests found" (exit 1) in
// screenshots.yml on every run since that merge, skipping every step after
// them. Fixed in #19467; this guards against the same class of gap for any
// future producer spec.
// Playwright's TestConfig['testMatch'] type also allows RegExp entries;
// ours are always string globs (see the array literal in
// playwright.config.screenshots.ts), so assert that here rather than at
// every call site.
// Load the real configuration during module collection, like other test
// dependencies. Cold Playwright initialization must not consume the timed
// discovery assertions' budget; importing this config does not start a server.
function toGlobFilenames(testMatch: readonly (string | RegExp)[]): string[] {
  return testMatch.map(pattern => {
    if (typeof pattern !== 'string') {
      throw new Error(
        `Expected a string glob pattern in testMatch, got a RegExp: ${pattern}`
      );
    }
    return pattern.replace(/^\*\*\//, '');
  });
}

async function loadScreenshotsConfig() {
  const originalBaseUrl = process.env.BASE_URL;
  try {
    process.env.BASE_URL = 'http://localhost:3100';
    return (await import('../../../playwright.config.screenshots')).default;
  } finally {
    if (originalBaseUrl === undefined) delete process.env.BASE_URL;
    else process.env.BASE_URL = originalBaseUrl;
  }
}

const config = await loadScreenshotsConfig();

describe('screenshots Playwright config test discovery', () => {
  const productScreenshotsDir = resolve(
    import.meta.dirname,
    '../../../tests/product-screenshots'
  );
  it('matches every *-screen-proof.spec.ts producer on disk', () => {
    const testMatch = config.testMatch;
    if (!Array.isArray(testMatch)) {
      throw new Error(
        'playwright.config.screenshots.ts testMatch is expected to be an array of glob patterns.'
      );
    }
    const matchedFilenames = new Set(toGlobFilenames(testMatch));

    const producerSpecs = readdirSync(productScreenshotsDir).filter(name =>
      name.endsWith('-screen-proof.spec.ts')
    );
    // Guards the guard: if this ever finds zero producer specs, the glob
    // above stopped matching real files and would pass vacuously.
    expect(producerSpecs.length).toBeGreaterThan(0);

    const unmatched = producerSpecs.filter(name => !matchedFilenames.has(name));
    expect(
      unmatched,
      `${unmatched.join(', ')} exist under tests/product-screenshots/ but are not in playwright.config.screenshots.ts's testMatch, so screenshots.yml's exact-path invocation reports "No tests found" for them.`
    ).toEqual([]);
  });

  it('does not carry a testMatch entry for a spec that no longer exists', () => {
    const testMatch = config.testMatch;
    if (!Array.isArray(testMatch)) {
      throw new Error(
        'playwright.config.screenshots.ts testMatch is expected to be an array of glob patterns.'
      );
    }
    const onDisk = new Set(readdirSync(productScreenshotsDir));

    const stale = toGlobFilenames(testMatch).filter(name => !onDisk.has(name));
    expect(
      stale,
      `testMatch references ${stale.join(', ')}, which no longer exist under tests/product-screenshots/.`
    ).toEqual([]);
  });
});
