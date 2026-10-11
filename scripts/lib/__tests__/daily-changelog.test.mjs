import { describe, expect, it } from 'vitest';
import { getLatestRelease, parseChangelog } from '../changelog-parser.mjs';
import {
  checkDailyFreshness,
  DAILY_EVALUATOR_VERSION,
  DAILY_RECEIPT_SCHEMA,
  DAILY_SOURCE_SCHEMA,
  dailyIdempotencyKey,
  evaluateDailyWindow,
  extractDailyReceipts,
  insertDailyDigest,
  processedDailySourceIds,
  renderDailyDigest,
  validateDailySource,
} from '../daily-changelog.mjs';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_C = 'c'.repeat(40);

function source(overrides = {}) {
  const { pr, linear, controller, deployment, buildInfo, ...rest } = overrides;
  const mergeSha = pr?.mergeSha ?? SHA_A;
  return {
    schema: DAILY_SOURCE_SCHEMA,
    id: 'src-1',
    outcomeKey: 'outcome-1',
    firstPublicAt: '2026-09-27T09:30:00Z',
    ...rest,
    pr: { number: 19001, mergeSha, ...pr },
    linear: {
      issueId: 'JOV-1',
      audience: 'public',
      visibility: 'public',
      releaseWorthy: true,
      approvedClaimIds: ['claim-search'],
      approvedFacts: [],
      sourceLinks: ['https://linear.app/jovie/issue/JOV-1'],
      ...linear,
    },
    controller: { status: 'succeeded', generationId: 'gen-1', ...controller },
    deployment: { id: 'dep-1', sha: mergeSha, ...deployment },
    buildInfo: {
      sha: mergeSha,
      observedAt: '2026-09-27T10:00:00Z',
      ...buildInfo,
    },
  };
}

function draft(overrides = {}) {
  return {
    id: 'story-1',
    section: 'Added',
    summary: 'You can find artists by searching your name.',
    bullets: [],
    sourceIds: ['src-1'],
    claimIds: ['claim-search'],
    ...overrides,
  };
}

const WINDOW = '2026-09-27';
const CHANGELOG = `# Changelog

## [Unreleased]

- [internal] pending note.

## [26.9.15] - 2026-09-21

### Added

- Older release entry.
`;

describe('daily-changelog-source/v1 validation', () => {
  it('accepts a fully receipted public source', () => {
    expect(validateDailySource(source())).toMatchObject({ eligible: true });
  });

  it('rejects PR-title-only input', () => {
    const titleOnly = { id: 'src-pr', title: 'feat: add artist search' };
    expect(validateDailySource(titleOnly)).toMatchObject({
      eligible: false,
      exclusion: 'malformed',
    });
  });

  it('excludes internal-only and unworthy sources', () => {
    for (const linear of [
      { audience: 'internal' },
      { visibility: 'internal' },
      { releaseWorthy: false },
    ]) {
      expect(validateDailySource(source({ linear }))).toMatchObject({
        eligible: false,
        exclusion: 'internal',
      });
    }
  });

  it('excludes merged-but-not-deployed receipts', () => {
    const mergedOnly = source({ deployment: undefined });
    delete mergedOnly.deployment;
    expect(validateDailySource(mergedOnly)).toMatchObject({
      eligible: false,
      exclusion: 'unavailable',
    });
  });

  it('excludes deployed receipts whose live SHA does not match', () => {
    expect(
      validateDailySource(source({ buildInfo: { sha: SHA_B } }))
    ).toMatchObject({ eligible: false, exclusion: 'unavailable' });
  });

  it('excludes failed, superseded, draft and prerelease generations', () => {
    for (const controller of [
      { status: 'failed' },
      { status: 'draft' },
      { status: 'prerelease' },
      { status: 'succeeded', supersededBy: 'gen-2' },
    ]) {
      expect(validateDailySource(source({ controller }))).toMatchObject({
        eligible: false,
        exclusion: 'unavailable',
      });
    }
  });
});

describe('evaluateDailyWindow', () => {
  it('publishes an eligible public change exactly once', () => {
    const result = evaluateDailyWindow({
      windowKey: WINDOW,
      sources: [source()],
      drafts: [draft()],
      evaluatedAt: '2026-09-28T00:15:00Z',
    });
    expect(result.passed).toBe(true);
    expect(result.noChange).toBe(false);
    expect(result.idempotencyKey).toBe(`daily-changelog/${WINDOW}@UTC`);
    expect(result.stories[0].sourceIds).toEqual(['src-1']);
    expect(result.receipt.schema).toBe(DAILY_RECEIPT_SCHEMA);
    expect(result.receipt.sourceReceiptIds).toEqual(['src-1']);
    expect(result.receipt.mergeShas).toEqual([SHA_A]);
    expect(result.receipt.deployments).toEqual([{ id: 'dep-1', sha: SHA_A }]);
    expect(result.receipt.evaluatorVersion).toBe(DAILY_EVALUATOR_VERSION);
  });

  it('emits a signed no-change receipt on an internal-only day', () => {
    const result = evaluateDailyWindow({
      windowKey: WINDOW,
      sources: [source({ id: 'src-int', linear: { audience: 'internal' } })],
      drafts: [],
    });
    expect(result.passed).toBe(true);
    expect(result.noChange).toBe(true);
    expect(result.exclusions).toEqual([
      { sourceId: 'src-int', reason: 'internal' },
    ]);
    expect(renderDailyDigest(result)).toBe('');
  });

  it('squashes duplicate outcomes with reciprocal provenance', () => {
    const dup = source({ id: 'src-2', pr: { number: 2, mergeSha: SHA_B } });
    const result = evaluateDailyWindow({
      windowKey: WINDOW,
      sources: [source(), dup],
      drafts: [draft()],
    });
    expect(result.passed).toBe(true);
    expect(result.exclusions).toContainEqual({
      sourceId: 'src-2',
      reason: 'duplicate-outcome',
    });
    expect(result.receipt.sourceReceiptIds).toEqual(['src-1']);
  });

  it('fails closed on unsupported numbers and unapproved claims', () => {
    const hallucinated = draft({
      summary: 'Search now runs 10x faster.',
      claimIds: ['claim-search'],
      bullets: [
        { text: 'Latency dropped to 42ms.', claimIds: ['claim-search'] },
      ],
    });
    const result = evaluateDailyWindow({
      windowKey: WINDOW,
      sources: [source()],
      drafts: [hallucinated],
    });
    expect(result.passed).toBe(false);
    expect(result.findings.map(f => f.rule)).toContain('unsupported-fact');

    const wrongClaim = evaluateDailyWindow({
      windowKey: WINDOW,
      sources: [source()],
      drafts: [draft({ claimIds: ['claim-invented'] })],
    });
    expect(wrongClaim.passed).toBe(false);
    expect(wrongClaim.findings.map(f => f.rule)).toContain('unsupported-claim');
  });

  it('passes when every number traces to approvedFacts', () => {
    const numeric = source({
      linear: {
        approvedClaimIds: ['claim-search'],
        approvedFacts: ['10', '42'],
      },
    });
    const result = evaluateDailyWindow({
      windowKey: WINDOW,
      sources: [numeric],
      drafts: [
        draft({
          summary: 'Search resolves in 42ms across 10 catalogs.',
          claimIds: ['claim-search'],
        }),
      ],
    });
    expect(result.passed).toBe(true);
  });

  it('includes a late-arriving receipt once, preserving its timestamp', () => {
    const late = source({ firstPublicAt: '2026-09-26T23:50:00Z' });
    const result = evaluateDailyWindow({
      windowKey: WINDOW,
      sources: [late],
      drafts: [draft()],
    });
    expect(result.passed).toBe(true);
    expect(result.receipt.lateArrivals).toEqual(['src-1']);
    expect(result.receipt.firstPublicAt['src-1']).toBe('2026-09-26T23:50:00Z');

    const rerun = evaluateDailyWindow({
      windowKey: WINDOW,
      sources: [late],
      drafts: [draft()],
      processedIds: ['src-1'],
    });
    expect(rerun.receipt.sourceReceiptIds).toEqual([]);
    expect(rerun.noChange).toBe(true);
    expect(rerun.receipt.alreadyProcessed).toEqual(['src-1']);
  });

  it('treats a receipt public after the window as unavailable', () => {
    const future = source({ firstPublicAt: '2026-09-28T00:30:00Z' });
    const result = evaluateDailyWindow({
      windowKey: WINDOW,
      sources: [future],
      drafts: [],
    });
    expect(result.exclusions).toEqual([
      { sourceId: 'src-1', reason: 'unavailable' },
    ]);
  });

  it('is idempotent: same inputs produce the same content key', () => {
    const args = {
      windowKey: WINDOW,
      sources: [source()],
      drafts: [draft()],
      evaluatedAt: '2026-09-28T00:15:00Z',
    };
    const first = evaluateDailyWindow(args);
    const second = evaluateDailyWindow(args);
    expect(first.contentKey).toBe(second.contentKey);
    expect(dailyIdempotencyKey(WINDOW)).toBe(first.idempotencyKey);
  });

  it('carries an approved next-step action into the story', () => {
    const action = {
      label: 'See it on a demo profile',
      href: '/demo/showcase/tim-white-profile?mode=subscribe',
    };
    const result = evaluateDailyWindow({
      windowKey: WINDOW,
      sources: [source()],
      drafts: [draft({ action })],
      evaluatedAt: '2026-09-28T00:15:00Z',
    });
    expect(result.passed).toBe(true);
    expect(result.stories[0].action).toEqual(action);
  });

  it.each([
    'javascript:alert(1)',
    'https://example.com/x',
    'https://jov.ie.evil.example/x',
    '//evil.example/x',
    'https://user:pw@jov.ie/x',
    'http://jov.ie/x',
  ])('fails closed on an unsafe action destination: %s', href => {
    const result = evaluateDailyWindow({
      windowKey: WINDOW,
      sources: [source()],
      drafts: [draft({ action: { label: 'Next', href } })],
    });
    expect(result.passed).toBe(false);
    expect(result.findings.map(finding => finding.rule)).toContain(
      'story-contract'
    );
  });
});

describe('digest rendering and persistence', () => {
  function published() {
    const result = evaluateDailyWindow({
      windowKey: WINDOW,
      sources: [source()],
      drafts: [
        draft({
          bullets: [
            {
              text: 'Open the homepage and search.',
              claimIds: ['claim-search'],
            },
          ],
        }),
      ],
      evaluatedAt: '2026-09-28T00:15:00Z',
    });
    const block = renderDailyDigest(result);
    return { result, markdown: insertDailyDigest(CHANGELOG, block, WINDOW) };
  }

  it('renders a date-keyed digest with a hidden machine receipt', () => {
    const { markdown } = published();
    expect(markdown).toContain(`## [${WINDOW}]`);
    expect(markdown).toContain('<!-- daily-changelog-receipt/v1 ');
    expect(markdown.indexOf(`## [${WINDOW}]`)).toBeLessThan(
      markdown.indexOf('## [Unreleased]')
    );
  });

  it('round-trips processed source IDs through the hidden receipt', () => {
    const { markdown } = published();
    const receipts = extractDailyReceipts(markdown);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].sourceReceiptIds).toEqual(['src-1']);
    expect(processedDailySourceIds(markdown)).toEqual(new Set(['src-1']));
  });

  it('replaces the one open draft block on rerun', () => {
    const { markdown } = published();
    const updated = evaluateDailyWindow({
      windowKey: WINDOW,
      sources: [source()],
      drafts: [draft({ summary: 'Revised outcome copy.' })],
      evaluatedAt: '2026-09-28T00:40:00Z',
    });
    const twice = insertDailyDigest(
      markdown,
      renderDailyDigest(updated),
      WINDOW
    );
    expect(twice.match(/## \[2026-09-27\]/g)).toHaveLength(1);
    expect(twice).toContain('Revised outcome copy.');
  });

  it('keeps CalVer and daily headings distinct to the Node parser', () => {
    const { markdown } = published();
    const { releases } = parseChangelog(markdown);
    expect(releases[0]).toMatchObject({
      version: WINDOW,
      kind: 'daily',
      date: WINDOW,
    });
    expect(releases[1]).toMatchObject({ version: '26.9.15', kind: 'release' });
    // The email path's latest release is the newest heading; the digest is
    // curated public copy so publishing it is correct.
    expect(getLatestRelease(markdown)?.kind).toBe('daily');
  });
});

describe('checkDailyFreshness', () => {
  it('fails red when an eligible receipt is unpublished past 25h', () => {
    // Deliberate-red fixture: release-worthy exact-public receipt omitted.
    const unconsumed = checkDailyFreshness({
      sources: [source()],
      processedIds: [],
      now: '2026-09-28T11:00:00Z',
    });
    expect(unconsumed.passed).toBe(false);
    expect(unconsumed.stale).toEqual([
      { sourceId: 'src-1', firstPublicAt: '2026-09-27T09:30:00Z' },
    ]);
  });

  it('passes once the receipt is consumed by a digest', () => {
    const consumed = checkDailyFreshness({
      sources: [source()],
      processedIds: ['src-1'],
      now: '2026-09-28T11:00:00Z',
    });
    expect(consumed.passed).toBe(true);
  });

  it('ignores ineligible and in-window receipts', () => {
    const fresh = checkDailyFreshness({
      sources: [
        source(),
        source({ id: 'src-int', linear: { audience: 'internal' } }),
      ],
      processedIds: [],
      now: '2026-09-27T20:00:00Z',
    });
    expect(fresh.passed).toBe(true);
  });
});

describe('window boundaries', () => {
  it('splits receipts across the midnight boundary', () => {
    const before = source({
      id: 'src-prev',
      firstPublicAt: '2026-09-26T23:59:59Z',
    });
    const during = source({
      id: 'src-in',
      outcomeKey: 'o2',
      pr: { number: 3, mergeSha: SHA_C },
      firstPublicAt: '2026-09-27T00:00:01Z',
    });
    const result = evaluateDailyWindow({
      windowKey: WINDOW,
      sources: [before, during],
      drafts: [
        draft({ id: 's-in', sourceIds: ['src-in'] }),
        draft({ id: 's-prev', sourceIds: ['src-prev'] }),
      ],
    });
    // The late receipt is still eligible (never dropped), flagged as late.
    expect(result.receipt.lateArrivals).toEqual(['src-prev']);
    expect(result.receipt.sourceReceiptIds).toEqual(['src-in', 'src-prev']);
  });

  it('fails closed on a malformed window key', () => {
    const result = evaluateDailyWindow({ windowKey: 'Sept 27', sources: [] });
    expect(result.passed).toBe(false);
    expect(result.findings[0].rule).toBe('window-contract');
  });

  it('fails closed on malformed persisted receipts', () => {
    const bad = extractDailyReceipts(
      'x <!-- daily-changelog-receipt/v1 {not json} --> y'
    );
    expect(bad[0].malformed).toBe(true);
  });
});
