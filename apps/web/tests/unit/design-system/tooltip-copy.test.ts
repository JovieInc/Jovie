/**
 * Tooltip copy rule (apps/web/components/atoms/Tooltip.README.md): a title of
 * 6 words or fewer plus at most one sentence of 15 words or fewer, no claims
 * or how-it-works copy, rich content limited to kbd and short lists.
 *
 * Runs the same scanner as `pnpm design:tooltip-copy:check` with the web
 * design-system guards, so a new violation fails CI. Grandfathered findings
 * (none today) live in packages/copy/tooltip-copy.baseline.json and may only
 * shrink.
 */
import {
  compareToBaseline,
  readBaseline,
  scanAll,
  toCounts,
  UPDATE_COMMAND,
} from '@jovie/copy/tooltip-copy-audit';
import { describe, expect, it } from 'vitest';

describe('tooltip copy rule', () => {
  it('adds no tooltip copy violations and keeps the baseline exact', () => {
    const { regressions, shrinks } = compareToBaseline(
      toCounts(scanAll()),
      readBaseline()
    );
    expect(regressions, 'new tooltip copy violations').toEqual([]);
    expect(shrinks, `fixed findings; run ${UPDATE_COMMAND}`).toEqual([]);
  });
});
