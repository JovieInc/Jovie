import { describe, expect, it } from 'vitest';

import {
  decideOutcome,
  incidentStartedAfterMerge,
  ingestionWatermark,
  isRevertOfPr,
  matchIncidentFiles,
  normalizeRepoPath,
  outcomeWindowClosed,
  parseGithubPrUrl,
  readBackfillDays,
  repoRelativePath,
  revertTargetPrNumber,
} from '@/lib/coding-agent-runs/outcomes';

const DAY = 86_400_000;
const MERGE = 1_800_000_000_000;

describe('decideOutcome', () => {
  it('keeps rows with no PR open', () => {
    expect(
      decideOutcome({
        hasPr: false,
        prMerged: false,
        revertDetected: false,
        incidentIds: [],
        nowMs: MERGE,
      })
    ).toBe('open');
  });

  it('labels closed-unmerged PRs abandoned immediately', () => {
    expect(
      decideOutcome({
        hasPr: true,
        prState: 'closed',
        prMerged: false,
        revertDetected: false,
        incidentIds: [],
        nowMs: MERGE,
      })
    ).toBe('abandoned');
  });

  it('keeps merged PRs inside the 7-day window open', () => {
    expect(
      decideOutcome({
        hasPr: true,
        prState: 'closed',
        prMerged: true,
        mergeTimestampMs: MERGE,
        revertDetected: false,
        incidentIds: [],
        nowMs: MERGE + 3 * DAY,
      })
    ).toBe('open');
  });

  it('labels merged PRs landed once the window closes with no signals', () => {
    expect(
      decideOutcome({
        hasPr: true,
        prState: 'closed',
        prMerged: true,
        mergeTimestampMs: MERGE,
        revertDetected: false,
        incidentIds: [],
        nowMs: MERGE + 7 * DAY + 1,
      })
    ).toBe('landed');
  });

  it('labels reverted even inside the window', () => {
    expect(
      decideOutcome({
        hasPr: true,
        prState: 'closed',
        prMerged: true,
        mergeTimestampMs: MERGE,
        revertDetected: true,
        incidentIds: [],
        nowMs: MERGE + DAY,
      })
    ).toBe('reverted');
  });

  it('labels failed when a Sentry incident touches diff files', () => {
    expect(
      decideOutcome({
        hasPr: true,
        prState: 'closed',
        prMerged: true,
        mergeTimestampMs: MERGE,
        revertDetected: false,
        incidentIds: ['12345'],
        nowMs: MERGE + 2 * DAY,
      })
    ).toBe('failed');
  });

  it('revert outranks incident', () => {
    expect(
      decideOutcome({
        hasPr: true,
        prState: 'closed',
        prMerged: true,
        mergeTimestampMs: MERGE,
        revertDetected: true,
        incidentIds: ['1'],
        nowMs: MERGE + 8 * DAY,
      })
    ).toBe('reverted');
  });

  it('merged with unknown merge time stays open', () => {
    expect(
      decideOutcome({
        hasPr: true,
        prState: 'closed',
        prMerged: true,
        mergeTimestampMs: null,
        revertDetected: false,
        incidentIds: [],
        nowMs: MERGE + 30 * DAY,
      })
    ).toBe('open');
  });
});

describe('outcomeWindowClosed', () => {
  it('is false before 7 days and true after', () => {
    expect(outcomeWindowClosed(MERGE, MERGE + 6 * DAY)).toBe(false);
    expect(outcomeWindowClosed(MERGE, MERGE + 7 * DAY)).toBe(true);
  });
});

describe('revert detection', () => {
  it('matches GitHub revert conventions', () => {
    expect(
      isRevertOfPr({ title: 'Revert "feat: add thing (#1234)"', body: null })
    ).toBe(true);
    expect(
      isRevertOfPr({ title: 'fix: x', body: 'Reverts jovieinc/jovie#1234' })
    ).toBe(true);
    expect(isRevertOfPr({ headRefName: 'revert-1234-fix' })).toBe(true);
    expect(isRevertOfPr({ title: 'feat: add thing', body: null })).toBe(false);
    expect(
      isRevertOfPr({
        title: 'fix: restore the button',
        body: 'Fix revert-button bug',
      })
    ).toBe(false);
  });

  it('does not treat a mention of revert as the reverted PR number', () => {
    expect(
      revertTargetPrNumber({
        title: 'fix: restore the button',
        body: 'Fix revert-button bug #555',
      })
    ).toBeNull();
  });

  it('counts a Sentry issue only when it starts after the merge', () => {
    expect(
      incidentStartedAfterMerge('2026-09-25T12:00:00Z', '2026-09-25T11:00:00Z')
    ).toBe(true);
    expect(
      incidentStartedAfterMerge('2026-09-20T12:00:00Z', '2026-09-25T11:00:00Z')
    ).toBe(false);
    expect(incidentStartedAfterMerge(undefined, '2026-09-25T11:00:00Z')).toBe(
      false
    );
  });

  it('holds the ingest watermark at the oldest unfinished thread', () => {
    expect(
      ingestionWatermark('2026-09-25T16:00:00.000Z', [
        null,
        '2026-09-25T15:10:00.000Z',
        '2026-09-25T15:40:00.000Z',
      ])
    ).toBe('2026-09-25T15:10:00.000Z');
    expect(ingestionWatermark('2026-09-25T16:00:00.000Z', [])).toBe(
      '2026-09-25T16:00:00.000Z'
    );
  });

  it('reads both backfill-day flag forms', () => {
    expect(readBackfillDays(['--backfill-days', '14'])).toBe(14);
    expect(readBackfillDays(['--backfill-days=7'])).toBe(7);
    expect(readBackfillDays(['--backfill-days', '14'], '3')).toBe(3);
  });

  it('extracts the reverted PR number', () => {
    expect(
      revertTargetPrNumber({
        title: 'Revert "x"',
        body: 'Reverts jovieinc/jovie#1234',
      })
    ).toBe(1234);
    expect(
      revertTargetPrNumber({ title: 'Revert change #555', body: null })
    ).toBe(555);
  });
});

describe('path matching', () => {
  const diffFiles = ['apps/web/lib/foo.ts', 'packages/ui/atoms/Btn.tsx'];

  it('normalizes paths', () => {
    expect(normalizeRepoPath('./apps/web/lib/foo.ts')).toBe(
      'apps/web/lib/foo.ts'
    );
    expect(normalizeRepoPath('/srv/app/apps/web/lib/foo.ts')).toBe(
      'srv/app/apps/web/lib/foo.ts'
    );
  });

  it('reduces absolute Sentry paths to repo-relative', () => {
    expect(
      repoRelativePath('/home/ci/work/apps/web/lib/foo.ts', diffFiles)
    ).toBe('apps/web/lib/foo.ts');
  });

  it('matches incident frames against the diff', () => {
    expect(
      matchIncidentFiles(
        ['/build/apps/web/lib/foo.ts', 'node_modules/react/index.js'],
        diffFiles
      )
    ).toEqual(['apps/web/lib/foo.ts']);
    expect(matchIncidentFiles(['other/file.ts'], diffFiles)).toEqual([]);
  });
});

describe('parseGithubPrUrl', () => {
  it('parses standard PR urls', () => {
    expect(
      parseGithubPrUrl('https://github.com/jovieinc/jovie/pull/18112')
    ).toEqual({ owner: 'jovieinc', repo: 'jovie', number: 18112 });
  });
  it('returns null on non-PR urls', () => {
    expect(parseGithubPrUrl('https://github.com/a/b/issues/1')).toBeNull();
    expect(parseGithubPrUrl(null)).toBeNull();
  });
});
