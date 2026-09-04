import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  formatViolations,
  jsxOpenings,
  lineOf,
  read,
  repoPath,
  requireDir,
  type Violation,
  WEB_ROOT,
} from './blocking-ui-invariants';

/**
 * one-notification-v1 (Tim lock 2026-09-03, JOV-5951,
 * gbrain ops/reviewed-invariants/blocking-ui-invariants-v1).
 *
 * At most one banner. Same-theme banners (credits, usage, cookies) collapse
 * to one, with one primary on it.
 *
 * Detector (source contract, fail closed): the chat composer surface
 * (`JovieChatSections.tsx` + its composition root `JovieChat.tsx`) gets
 * exactly ONE banner slot. A second banner-family component (`*UsageAlert`,
 * `*Banner`, `InfoBox`, `*Notice`) rendered by the composer surface is a
 * violation — same-theme banners must collapse into the existing slot rather
 * than stack on it. `ChatUsageAlert` itself already collapses its own states
 * (`near_limit` XOR `exhausted`) into a single InfoBox.
 *
 * Fail-closed: the composer surface must exist and must still contain its
 * one known banner slot, or the detector is blind and the test is red.
 */

const JOVIE_DIR = join(WEB_ROOT, 'components', 'jovie');
const COMPOSER_SURFACE = join(JOVIE_DIR, 'JovieChatSections.tsx');
const COMPOSITION_ROOT = join(JOVIE_DIR, 'JovieChat.tsx');
const BANNER_FAMILY = /(?:[A-Za-z][\w.]*)?(?:UsageAlert|Banner|InfoBox|Notice)/;
const MAX_BANNER_SLOTS = 1;

describe('one-notification-v1', () => {
  it('chat composer surface carries at most one banner slot', () => {
    requireDir(JOVIE_DIR, 'components/jovie');

    const surfaceSource = read(COMPOSER_SURFACE);
    expect(
      surfaceSource.includes('ChatUsageAlert'),
      `[one-notification-v1] ${repoPath(COMPOSER_SURFACE)} no longer renders the canonical ChatUsageAlert slot — detector is blind, failing closed`
    ).toBe(true);

    const violations: Violation[] = [];
    for (const file of [COMPOSER_SURFACE, COMPOSITION_ROOT]) {
      const source = read(file);
      const banners = jsxOpenings(source, BANNER_FAMILY);
      if (banners.length > MAX_BANNER_SLOTS) {
        const lines = banners
          .map(opening => `L${lineOf(source, opening.index)}`)
          .join(', ');
        violations.push({
          file: repoPath(file),
          detail:
            `${banners.length} banner-family render sites (${lines}); ` +
            'same-theme banners collapse to one slot with one primary',
        });
      }
    }

    expect
      .soft(violations, formatViolations('one-notification-v1', violations))
      .toEqual([]);
    expect(violations).toHaveLength(0);
  });
});
