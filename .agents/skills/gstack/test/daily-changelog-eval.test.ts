import { describe, expect, test } from 'bun:test';
import {
  DAILY_EVAL_SCHEMA,
  evaluateDailyChangelog,
  type DailyChangelogEvalInput,
  type DailySourceReceipt,
  type DailyStory,
} from '../scripts/daily-changelog-eval';

const MERGE_SHA = 'a94166f4069664e57220f295e4759976a9282863';
const DEPLOY_SHA = '288bbcc66641fd3555125b367871e35f9382c1cd';
const OTHER_SHA = 'b94166f4069664e57220f295e4759976a9282863';

function eligibleSource(
  id: string,
  outcomeKey = 'artist-search',
  overrides: Partial<DailySourceReceipt> = {}
): DailySourceReceipt {
  return {
    schema: 'daily-changelog-source/v1',
    id,
    mergeSha: MERGE_SHA,
    outcomeKey,
    metadata: {
      issueId: 'JOV-5762',
      audience: 'artists',
      visibility: 'public',
      releaseWorthy: true,
      approvedClaimIds: ['claim-artist-search', 'claim-3'],
      approvedFacts: [
        'Search your name on the homepage to see matching artists and their Spotify profiles.',
        'Results appear in under 3 seconds.',
      ],
      sourceLinks: ['https://linear.app/jovie/issue/JOV-5762'],
    },
    controllerGeneration: { id: 'gen-1', status: 'succeeded', sha: DEPLOY_SHA },
    deployment: { id: 'dep-1', sha: DEPLOY_SHA },
    publicReadback: { sha: DEPLOY_SHA, firstPublicAt: '2026-09-25T10:00:00Z' },
    ...overrides,
  };
}

function story(
  id: string,
  sourceReceiptIds: string[],
  overrides: Partial<DailyStory> = {}
): DailyStory {
  return {
    id,
    headline: 'Find your artist profile',
    summary:
      'Search your name on the homepage to see matching artists and their Spotify profiles.',
    bullets: ['Results appear in under 3 seconds.'],
    claimIds: ['claim-artist-search'],
    sourceReceiptIds,
    ...overrides,
  };
}

function evalInput(overrides: Partial<DailyChangelogEvalInput> = {}): DailyChangelogEvalInput {
  return {
    schema: DAILY_EVAL_SCHEMA,
    windowKey: '2026-09-25',
    evaluatedAt: '2026-09-26T00:15:00Z',
    sources: [eligibleSource('rcpt-1')],
    digest: { stories: [story('artist-search', ['rcpt-1'])] },
    ...overrides,
  };
}

describe('daily changelog eval', () => {
  test('accepts an eligible public change with reciprocal provenance', () => {
    const result = evaluateDailyChangelog(evalInput());
    expect(result.passed).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.idempotencyKey).toBe('daily-changelog/2026-09-25@UTC');
    expect(result.eligibleSourceIds).toEqual(['rcpt-1']);
    expect(result.noChange).toBe(false);
  });

  test('no-change day: internal-only sources emit a no-change receipt', () => {
    const internal = eligibleSource('rcpt-internal', 'ops-metrics', {
      metadata: {
        issueId: 'JOV-1', audience: 'operators', visibility: 'internal',
        releaseWorthy: true, approvedClaimIds: [], approvedFacts: [], sourceLinks: [],
      },
    });
    const result = evaluateDailyChangelog(
      evalInput({ sources: [internal], digest: null })
    );
    expect(result.passed).toBe(true);
    expect(result.noChange).toBe(true);
    expect(result.exclusions).toEqual([{ id: 'rcpt-internal', reason: 'internal' }]);
  });

  test('no-change day: a digest with zero eligible sources is a vanity post', () => {
    const internal = eligibleSource('rcpt-internal', 'ops', {
      metadata: {
        issueId: 'JOV-1', audience: 'operators', visibility: 'internal',
        releaseWorthy: true, approvedClaimIds: [], approvedFacts: [], sourceLinks: [],
      },
    });
    const result = evaluateDailyChangelog(
      evalInput({ sources: [internal], digest: { stories: [] } })
    );
    expect(result.passed).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: 'vanity-digest' })])
    );
  });

  test('merged but not deployed is not available', () => {
    const mergedOnly = eligibleSource('rcpt-merged', 'artist-search', {
      controllerGeneration: { id: 'gen-1', status: 'succeeded', sha: DEPLOY_SHA },
      deployment: undefined,
      publicReadback: undefined,
    });
    const result = evaluateDailyChangelog(
      evalInput({ sources: [mergedOnly], digest: null })
    );
    expect(result.passed).toBe(true);
    expect(result.noChange).toBe(true);
    expect(result.exclusions).toEqual([{ id: 'rcpt-merged', reason: 'unavailable' }]);
  });

  test('deployed but live SHA mismatch is not available', () => {
    const mismatched = eligibleSource('rcpt-mismatch', 'artist-search', {
      publicReadback: { sha: OTHER_SHA, firstPublicAt: '2026-09-25T10:00:00Z' },
    });
    const result = evaluateDailyChangelog(
      evalInput({ sources: [mismatched], digest: null })
    );
    expect(result.passed).toBe(true);
    expect(result.exclusions).toEqual([
      { id: 'rcpt-mismatch', reason: 'unavailable' },
    ]);
  });

  test('superseded and failed controller generations are ineligible', () => {
    const superseded = eligibleSource('rcpt-sup', 'a', {
      controllerGeneration: { id: 'gen-1', status: 'superseded' },
    });
    const failed = eligibleSource('rcpt-fail', 'b', {
      controllerGeneration: { id: 'gen-2', status: 'failed' },
    });
    const result = evaluateDailyChangelog(
      evalInput({ sources: [superseded, failed], digest: null })
    );
    expect(result.passed).toBe(true);
    expect(result.exclusions).toEqual([
      { id: 'rcpt-sup', reason: 'unavailable' },
      { id: 'rcpt-fail', reason: 'unavailable' },
    ]);
  });

  test('PR-title-only input is rejected by the source contract', () => {
    const titleOnly = { id: 'rcpt-title' } as unknown as DailySourceReceipt;
    const result = evaluateDailyChangelog(
      evalInput({ sources: [titleOnly], digest: null })
    );
    expect(result.passed).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'source-contract', sourceId: 'rcpt-title' }),
      ])
    );
    expect(result.exclusions).toEqual([
      { id: 'rcpt-title', reason: 'failed-validation' },
    ]);
  });

  test('rejects an unsupported number and an unapproved claim', () => {
    const hallucinated = story('artist-search', ['rcpt-1'], {
      summary: 'Search is now 10x faster for 500 artists.',
      claimIds: ['claim-artist-search', 'claim-made-up'],
    });
    const result = evaluateDailyChangelog(
      evalInput({ digest: { stories: [hallucinated] } })
    );
    expect(result.passed).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'unsupported-number' }),
        expect.objectContaining({ rule: 'unsupported-claim' }),
      ])
    );
  });

  test('squashes exact duplicate outcomes into one story', () => {
    const dup = eligibleSource('rcpt-2', 'artist-search', {
      mergeSha: OTHER_SHA,
    });
    const split = structuredClone(evalInput());
    split.sources = [eligibleSource('rcpt-1'), dup];
    split.digest = {
      stories: [
        story('artist-search', ['rcpt-1']),
        story('artist-search-again', ['rcpt-2'], { headline: 'Search artists' }),
      ],
    };
    expect(evaluateDailyChangelog(split).findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: 'missed-squash' })])
    );
    const merged = structuredClone(split);
    merged.digest = { stories: [story('artist-search', ['rcpt-1', 'rcpt-2'])] };
    const result = evaluateDailyChangelog(merged);
    expect(result.findings).toEqual([]);
    expect(result.consumedSourceIds).toEqual(['rcpt-1', 'rcpt-2']);
  });

  test('deliberate red: omitting an eligible receipt fails the evaluation', () => {
    const result = evaluateDailyChangelog(evalInput({ digest: { stories: [] } }));
    expect(result.passed).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'omitted-eligible-source', sourceId: 'rcpt-1' }),
      ])
    );
  });

  test('deliberate red: a null digest with eligible sources is a fabrication gap', () => {
    const result = evaluateDailyChangelog(evalInput({ digest: null }));
    expect(result.passed).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'omitted-eligible-source' }),
        expect.objectContaining({ rule: 'digest-required' }),
      ])
    );
  });

  test('a late exact-public arrival is included once and marked, never backdated', () => {
    const late = eligibleSource('rcpt-late', 'late-feature', {
      publicReadback: { sha: DEPLOY_SHA, firstPublicAt: '2026-09-23T08:00:00Z' },
    });
    const input = evalInput({
      sources: [eligibleSource('rcpt-1'), late],
      digest: {
        stories: [
          story('artist-search', ['rcpt-1']),
          story('late-feature', ['rcpt-late'], {
            headline: 'Late feature',
            summary: 'Search your name on the homepage.',
            bullets: [],
            claimIds: ['claim-artist-search'],
          }),
        ],
      },
    });
    const result = evaluateDailyChangelog(input);
    expect(result.passed).toBe(true);
    expect(result.lateArrivalSourceIds).toEqual(['rcpt-late']);
    expect(result.windowKey).toBe('2026-09-25');
  });

  test('consuming a source twice across stories fails', () => {
    const input = evalInput({
      digest: {
        stories: [
          story('a', ['rcpt-1']),
          story('b', ['rcpt-1'], { headline: 'Again' }),
        ],
      },
    });
    const result = evaluateDailyChangelog(input);
    expect(result.passed).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: 'duplicate-consumption' })])
    );
  });

  test('evaluating before the UTC window closes fails', () => {
    const result = evaluateDailyChangelog(
      evalInput({ evaluatedAt: '2026-09-25T23:59:00Z' })
    );
    expect(result.passed).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'evaluation-before-window-close' }),
      ])
    );
  });

  test('malformed window key fails closed', () => {
    const result = evaluateDailyChangelog(evalInput({ windowKey: '09-25-2026' }));
    expect(result.passed).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: 'window-contract' })])
    );
  });

  test('25-hour freshness alert fires for an eligible unconsumed receipt', () => {
    const stale = eligibleSource('rcpt-stale', 'stale-feature', {
      publicReadback: { sha: DEPLOY_SHA, firstPublicAt: '2026-09-24T20:00:00Z' },
    });
    const result = evaluateDailyChangelog(
      evalInput({ sources: [stale], digest: null })
    );
    expect(result.passed).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'stale-unpublished-source', sourceId: 'rcpt-stale' }),
      ])
    );
  });

  test('stories may have at most three bullets', () => {
    const fat = story('artist-search', ['rcpt-1'], {
      bullets: [
        'Results appear in under 3 seconds.',
        'Search your name on the homepage.',
        'See matching artists.',
        'See their Spotify profiles.',
      ],
    });
    const result = evaluateDailyChangelog(evalInput({ digest: { stories: [fat] } }));
    expect(result.passed).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: 'story-bullet-bound' })])
    );
  });

  test('wrong schema fails closed', () => {
    const result = evaluateDailyChangelog(
      evalInput({ schema: 'daily-changelog-eval/v0' as never })
    );
    expect(result.passed).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ rule: 'schema' })])
    );
  });
});
