import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DESKTOP_PUBLIC_PROFILE_ACTION_TESTIDS,
  PUBLIC_PROFILE_ACTION_AFFORDANCE_SELECTORS,
  publicProfileActionAffordanceSelector,
} from '@/tests/e2e/utils/public-profile-action-affordances';

const testDir = dirname(fileURLToPath(import.meta.url));
const smokeSpec = readFileSync(
  resolve(testDir, '../../e2e/public-profile-smoke.spec.ts'),
  'utf8'
);

describe('public profile smoke action affordances', () => {
  it('matches the desktop 1280×720 contract, not hidden compact tab chrome', () => {
    const selector = publicProfileActionAffordanceSelector();
    const selectorSet = new Set<string>(PUBLIC_PROFILE_ACTION_AFFORDANCE_SELECTORS);

    for (const testId of DESKTOP_PUBLIC_PROFILE_ACTION_TESTIDS) {
      const testIdSelector = `[data-testid="${testId}"]`;
      expect(selectorSet.has(testIdSelector)).toBe(true);
      expect(selector).toContain(testIdSelector);
    }

    expect(selectorSet.has('a[href*="mode=subscribe"]')).toBe(true);
    expect(selectorSet.has('a[aria-label*="Follow"]')).toBe(true);
    expect(selectorSet.has('a:has-text("Follow")')).toBe(true);
    expect(selectorSet.has('a:has-text("Subscribe")')).toBe(true);

    // Compact chrome stays as a <1180 fallback; it is not the only match.
    expect(selectorSet.has('[data-testid="profile-tab-bar"]')).toBe(true);
    expect(PUBLIC_PROFILE_ACTION_AFFORDANCE_SELECTORS[0]).not.toBe(
      '[data-testid="profile-tab-bar"]'
    );
  });

  it('uses the shared desktop-aware selector list from the synthetic smoke spec', () => {
    expect(smokeSpec).toContain('publicProfileActionAffordanceSelector');
    expect(smokeSpec).not.toContain("'[data-testid=\"profile-tab-bar\"]'");
  });
});
