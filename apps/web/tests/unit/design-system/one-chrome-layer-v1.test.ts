import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  formatViolations,
  read,
  repoPath,
  requireDir,
  type Violation,
  WEB_ROOT,
} from './blocking-ui-invariants';

/**
 * one-chrome-layer-v1 (Tim lock 2026-09-03, JOV-5951,
 * gbrain ops/reviewed-invariants/blocking-ui-invariants-v1).
 *
 * At most one non-content chrome layer: prompt-suggests XOR status banners.
 * Never both.
 *
 * Detector (source contract, fail closed): the chat composer surface renders
 * the usage banner (`ChatUsageAlert`) only behind the `suppressUsageAlert`
 * gate, and the composition root (`JovieChat.tsx`) must drive that gate from
 * the empty-state affordance so an active prompt-suggest / starter-action
 * layer suppresses the banner. Missing wiring on either side is a violation
 * — without it the Exhibit A stack (banners on top of prompt suggests) can
 * silently return.
 *
 * Fail-closed: both files must exist and the gate must be present in the
 * source, or the test is red.
 */

const JOVIE_DIR = join(WEB_ROOT, 'components', 'jovie');
const COMPOSITION_ROOT = join(JOVIE_DIR, 'JovieChat.tsx');
const COMPOSER_SURFACE = join(JOVIE_DIR, 'JovieChatSections.tsx');

describe('one-chrome-layer-v1', () => {
  it('usage banner is gated off whenever the empty state shows a chrome affordance', () => {
    requireDir(JOVIE_DIR, 'components/jovie');

    const rootSource = read(COMPOSITION_ROOT);
    const surfaceSource = read(COMPOSER_SURFACE);
    const violations: Violation[] = [];

    if (!/suppressUsageAlert/.test(rootSource)) {
      violations.push({
        file: repoPath(COMPOSITION_ROOT),
        detail:
          'composition root never passes suppressUsageAlert — the banner can stack on prompt suggests',
      });
    }
    if (
      !/suppressUsageAlert\s*\?\s*null\s*:\s*<ChatUsageAlert/.test(
        surfaceSource
      )
    ) {
      violations.push({
        file: repoPath(COMPOSER_SURFACE),
        detail:
          'ChatUsageAlert is not gated on suppressUsageAlert — prompt suggests and the banner can render together',
      });
    }

    expect
      .soft(violations, formatViolations('one-chrome-layer-v1', violations))
      .toEqual([]);
    expect(violations).toHaveLength(0);
  });
});
