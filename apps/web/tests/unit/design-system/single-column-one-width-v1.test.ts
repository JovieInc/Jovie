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
 * single-column-one-width-v1 (Tim lock 2026-09-03, JOV-5951,
 * gbrain ops/reviewed-invariants/blocking-ui-invariants-v1).
 *
 * One stacked column shares one max-width. Stepped/jagged left-right edges
 * are red.
 *
 * Detector (source contract, fail closed): the empty-chat column is composed
 * in `components/jovie/JovieChat.tsx` — the prompt-suggest slot, the
 * starter-action slot, and the composer all dock into the single 45rem
 * content shell (`CHAT_CONTENT_SHELL_CLASSNAME`). A column layer that sets
 * its own arbitrary max-width (`max-w-[...]`) re-creates the Exhibit A
 * three-width stack, so any arbitrary max-width in the composition root is a
 * violation. Locked atoms (28rem starter/opportunity cards, sample bubbles)
 * live in their own components and are out of scope — atoms stay.
 *
 * Fail-closed: the composition root must exist and must still render the
 * empty-state slots, or the detector is blind and the test is red.
 */

const COMPOSITION_ROOT = join(WEB_ROOT, 'components', 'jovie', 'JovieChat.tsx');
const EMPTY_STATE_SLOTS = [
  'chat-empty-state-soft-suggestions-slot',
  'chat-empty-state-action-card-slot',
  'chat-empty-state-viewport',
];
const ARBITRARY_MAX_WIDTH = /max-w-\[/g;

describe('single-column-one-width-v1', () => {
  it('chat empty-state column layers share the single content-shell width', () => {
    requireDir(join(WEB_ROOT, 'components', 'jovie'), 'components/jovie');
    requireDir(WEB_ROOT, 'apps/web');

    const source = read(COMPOSITION_ROOT);
    for (const slot of EMPTY_STATE_SLOTS) {
      expect(
        source.includes(slot),
        `[single-column-one-width-v1] ${repoPath(COMPOSITION_ROOT)} no longer renders ${slot} — detector is blind, failing closed`
      ).toBe(true);
    }

    const violations: Violation[] = [];
    for (const match of source.matchAll(ARBITRARY_MAX_WIDTH)) {
      violations.push({
        file: repoPath(COMPOSITION_ROOT),
        detail:
          `arbitrary max-width '${match[0]}…' on a column layer; ` +
          'the stacked column inherits the one content-shell width',
      });
    }

    expect
      .soft(
        violations,
        formatViolations('single-column-one-width-v1', violations)
      )
      .toEqual([]);
    expect(violations).toHaveLength(0);
  });
});
