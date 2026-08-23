import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  evaluateShrinkOnlyCount,
  resolveShrinkOnlyCountEvent,
  SHRINK_ONLY_COUNT_EVENTS,
  SHRINK_ONLY_COUNT_STATUSES,
} from '@/lib/design/shrink-only-count-ratchet';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LINEAR_RATCHET_PATH = join(__dirname, 'linear-namespace-ratchet.test.ts');

describe('shrink-only count ratchet (merge-group safe)', () => {
  it('passes when count matches the baseline', () => {
    expect(
      evaluateShrinkOnlyCount({
        count: 1609,
        baseline: 1609,
        event: SHRINK_ONLY_COUNT_EVENTS.MERGE_GROUP,
        metric: '--linear-* usage',
      })
    ).toMatchObject({
      ok: true,
      status: SHRINK_ONLY_COUNT_STATUSES.PASS,
      message: '',
    });
  });

  it('fails closed on growth in every event, including merge_group', () => {
    for (const event of Object.values(SHRINK_ONLY_COUNT_EVENTS)) {
      const verdict = evaluateShrinkOnlyCount({
        count: 2239,
        baseline: 2237,
        event,
        metric: 'arbitrary Tailwind values',
      });
      expect(verdict).toMatchObject({
        ok: false,
        status: SHRINK_ONLY_COUNT_STATUSES.REGRESSION,
        event,
      });
      expect(verdict.message).toContain('2239 > baseline 2237');
    }
  });

  it('does not fail a merge_group for shrink-without-baseline (1609→1607)', () => {
    const verdict = evaluateShrinkOnlyCount({
      count: 1607,
      baseline: 1609,
      event: SHRINK_ONLY_COUNT_EVENTS.MERGE_GROUP,
      metric: '--linear-* usage',
    });

    expect(verdict).toMatchObject({
      ok: true,
      status: SHRINK_ONLY_COUNT_STATUSES.SIBLING_SHRINK,
      count: 1607,
      baseline: 1609,
    });
    expect(verdict.message).toContain('UNMERGEABLE');
    expect(verdict.message).toContain('1607');
  });

  it('still fail-closes unbaselined shrink on pull_request and local authorship', () => {
    for (const event of [
      SHRINK_ONLY_COUNT_EVENTS.PULL_REQUEST,
      SHRINK_ONLY_COUNT_EVENTS.LOCAL,
    ] as const) {
      const verdict = evaluateShrinkOnlyCount({
        count: 1607,
        baseline: 1609,
        event,
        metric: '--linear-* usage',
      });
      expect(verdict).toMatchObject({
        ok: false,
        status: SHRINK_ONLY_COUNT_STATUSES.UNBASELINED_SHRINK,
        event,
      });
      expect(verdict.message).toContain('lower the baseline to 1607');
    }
  });

  it('reads GITHUB_EVENT_NAME so merge_group unit shards use the sibling-shrink pass', () => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'merge_group');
    try {
      expect(
        evaluateShrinkOnlyCount({
          count: 1607,
          baseline: 1609,
          metric: '--linear-* usage',
        })
      ).toMatchObject({
        ok: true,
        status: SHRINK_ONLY_COUNT_STATUSES.SIBLING_SHRINK,
        event: SHRINK_ONLY_COUNT_EVENTS.MERGE_GROUP,
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('maps GitHub event names and treats unknown/empty as local', () => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'merge_group');
    try {
      expect(resolveShrinkOnlyCountEvent('merge_group')).toBe(
        SHRINK_ONLY_COUNT_EVENTS.MERGE_GROUP
      );
      expect(resolveShrinkOnlyCountEvent('pull_request')).toBe(
        SHRINK_ONLY_COUNT_EVENTS.PULL_REQUEST
      );
      expect(resolveShrinkOnlyCountEvent('workflow_dispatch')).toBe(
        SHRINK_ONLY_COUNT_EVENTS.LOCAL
      );
      expect(resolveShrinkOnlyCountEvent('')).toBe(
        SHRINK_ONLY_COUNT_EVENTS.LOCAL
      );
      expect(resolveShrinkOnlyCountEvent(undefined)).toBe(
        SHRINK_ONLY_COUNT_EVENTS.LOCAL
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('rejects non-finite measurements', () => {
    expect(() =>
      evaluateShrinkOnlyCount({ count: Number.NaN, baseline: 1 })
    ).toThrow(/finite numbers/);
    expect(() =>
      evaluateShrinkOnlyCount({ count: 1, baseline: Number.POSITIVE_INFINITY })
    ).toThrow(/finite numbers/);
  });

  it('keeps linear-namespace ratchet on the merge_group-safe helper', () => {
    const source = readFileSync(LINEAR_RATCHET_PATH, 'utf8');
    expect(source).toContain('evaluateShrinkOnlyCount');
    expect(source).not.toMatch(
      /if\s*\(\s*count\s*<\s*baseline\.count\s*\)\s*\{\s*expect\.fail/
    );
  });
});
