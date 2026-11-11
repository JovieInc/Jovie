import { describe, expect, it } from 'vitest';
import {
  attributeAgainstAheadRun,
  attributeAgainstPeerRuns,
  selectCiFastEvidenceJobs,
} from '../merge-group-ahead-attribution.mjs';

describe('structural core matrix jobs (Move 3)', () => {
  const CORE_1 = 'ci-fast (structural core 1/2)';
  const CORE_2 = 'ci-fast (structural core 2/2)';
  const COMMAND = 'pnpm doc:freshness:check';

  const structuralLog = (passed, failed = []) =>
    [
      '======== lane: structural ========',
      `[ci-fast] structural: ${failed.length ? 'failure' : 'success'} (10.0s)`,
      ...[...passed, ...failed].map((command, index) => {
        const code = failed.includes(command) ? 'exit 1' : 'pass';
        return `| ${index + 1} | 1.0s | ${code} | \`${command}\` |`;
      }),
      ...failed.map(
        command =>
          `Structural command 1/1 failed (exit 1). Command: ${command} | tail`
      ),
    ].join('\n') + '\n';

  it('collects evidence jobs across remaining and the core matrix legs', () => {
    const jobs = [
      { name: 'ci-fast (remaining)', conclusion: 'failure', id: 1 },
      { name: CORE_1, conclusion: 'failure', id: 2 },
      { name: CORE_2, conclusion: 'success', id: 3 },
      { name: 'ci-fast (structural python)', conclusion: 'failure', id: 4 },
      { name: 'PR Ready', conclusion: 'failure', id: 5 },
    ];
    expect(selectCiFastEvidenceJobs(jobs).map(job => job.id)).toEqual([1, 2]);
    expect(
      selectCiFastEvidenceJobs(jobs, { includeSuccessful: true }).map(
        job => job.id
      )
    ).toEqual([1, 2, 3]);
    expect(selectCiFastEvidenceJobs([])).toEqual([]);
  });

  it('attributes a core-leg failure when the exact command passed on the ahead run, across shards', () => {
    // The failing command sat in shard 2 on the ahead tree: partition
    // membership is not evidence, the command's own pass row is.
    const result = attributeAgainstAheadRun({
      currentJobs: [
        { name: CORE_1, conclusion: 'failure' },
        { name: CORE_2, conclusion: 'success' },
        { name: 'PR Ready', conclusion: 'failure' },
      ],
      aheadJobs: [
        { name: CORE_1, conclusion: 'success' },
        { name: CORE_2, conclusion: 'success' },
      ],
      aheadConclusion: 'failure',
      currentCiFastLog: [
        {
          name: CORE_1,
          log: structuralLog(['pnpm ci:merge-queue:check'], [COMMAND]),
        },
      ],
      aheadCiFastLog:
        structuralLog(['pnpm ci:merge-queue:check']) +
        structuralLog([COMMAND, 'pnpm doc:garden']),
    });
    expect(result).toEqual({
      attributable: true,
      reason: 'failing-signals-passed-on-ahead-run',
    });
  });

  it('refuses attribution when a second failed shard has no parsed lane evidence', () => {
    // Astra's 3R repro: core 1 fails a parsed command, core 2 dies during
    // the base fetch (no lane output at all). The parsed failure can never
    // speak for the unparsed one.
    const result = attributeAgainstAheadRun({
      currentJobs: [
        { name: CORE_1, conclusion: 'failure' },
        { name: CORE_2, conclusion: 'failure' },
        { name: 'PR Ready', conclusion: 'failure' },
      ],
      aheadJobs: [
        { name: CORE_1, conclusion: 'success' },
        { name: CORE_2, conclusion: 'success' },
      ],
      aheadConclusion: 'failure',
      currentCiFastLog: [
        { name: CORE_1, log: structuralLog([], [COMMAND]) },
        { name: CORE_2, log: 'fetch: waiting for the base branch\n' },
      ],
      aheadCiFastLog:
        structuralLog([COMMAND]) + structuralLog(['pnpm ci:merge-queue:check']),
    });
    expect(result).toEqual({
      attributable: false,
      reason: `ci-fast-failure-unparsed:${CORE_2}`,
    });
  });

  it('refuses attribution when a failed shard log is missing entirely', () => {
    const result = attributeAgainstAheadRun({
      currentJobs: [
        { name: CORE_1, conclusion: 'failure' },
        { name: CORE_2, conclusion: 'failure' },
        { name: 'PR Ready', conclusion: 'failure' },
      ],
      aheadJobs: [
        { name: CORE_1, conclusion: 'success' },
        { name: CORE_2, conclusion: 'success' },
      ],
      aheadConclusion: 'failure',
      currentCiFastLog: [{ name: CORE_1, log: structuralLog([], [COMMAND]) }],
      aheadCiFastLog: structuralLog([COMMAND]),
    });
    expect(result).toEqual({
      attributable: false,
      reason: `ci-fast-log-missing:${CORE_2}`,
    });
  });

  it('refuses attribution when the ahead run succeeded without running the command', () => {
    const result = attributeAgainstAheadRun({
      currentJobs: [
        { name: CORE_1, conclusion: 'failure' },
        { name: 'PR Ready', conclusion: 'failure' },
      ],
      aheadJobs: [
        { name: CORE_1, conclusion: 'success' },
        { name: CORE_2, conclusion: 'success' },
      ],
      aheadConclusion: 'failure',
      currentCiFastLog: [{ name: CORE_1, log: structuralLog([], [COMMAND]) }],
      aheadCiFastLog: structuralLog(['pnpm ci:merge-queue:check']),
    });
    expect(result.attributable).toBe(false);
    expect(result.reason).toBe(
      `structural-command-unproven-on-base:${COMMAND}`
    );
  });

  it('recognizes a single failing core leg as the structural-only peer shape', () => {
    const currentLog =
      structuralLog([], [COMMAND]) +
      'FAIL scripts/lib/__tests__/doc-freshness.test.mjs > stale doc\n';
    const result = attributeAgainstPeerRuns({
      currentJobs: [
        { name: CORE_2, conclusion: 'failure' },
        { name: 'PR Ready', conclusion: 'failure' },
      ],
      currentCiFastLog: currentLog,
      peers: [],
    });
    // Past the recognition gate: the core leg read as the structural
    // evidence job; only the missing peer witness stops the verdict.
    expect(result.reason).toBe(
      'signal-not-seen-without-pr:scripts/lib/__tests__/doc-freshness.test.mjs > stale doc'
    );
  });
});

describe('collector entries array (Move 3 3R)', () => {
  const CORE_2 = 'ci-fast (structural core 2/2)';
  const COMMAND = 'pnpm doc:freshness:check';
  const failingLog =
    [
      '======== lane: structural ========',
      '[ci-fast] structural: failure (10.0s)',
      `| 1 | 1.0s | exit 1 | \`${COMMAND}\` |`,
      `Structural command 1/1 failed (exit 1). Command: ${COMMAND} | tail`,
      'FAIL scripts/lib/__tests__/doc-freshness.test.mjs > stale doc',
    ].join('\n') + '\n';

  it('accepts a single-entry collector array on the peer path', () => {
    const result = attributeAgainstPeerRuns({
      currentJobs: [
        { name: CORE_2, conclusion: 'failure' },
        { name: 'PR Ready', conclusion: 'failure' },
      ],
      currentCiFastLog: [{ name: CORE_2, log: failingLog }],
      peers: [
        {
          runId: 77,
          conclusion: 'failure',
          containsPr: false,
          ciFastLog: failingLog,
        },
      ],
    });
    expect(result).toEqual({
      recurring: true,
      reason: 'failing-signals-recurred-without-pr',
      signals: ['scripts/lib/__tests__/doc-freshness.test.mjs > stale doc'],
      peerRunIds: [77],
    });
  });

  it('refuses a multi-entry collector array on the single-failure peer path', () => {
    const result = attributeAgainstPeerRuns({
      currentJobs: [
        { name: CORE_2, conclusion: 'failure' },
        { name: 'PR Ready', conclusion: 'failure' },
      ],
      currentCiFastLog: [
        { name: CORE_2, log: failingLog },
        { name: 'ci-fast (structural core 1/2)', log: failingLog },
      ],
      peers: [
        {
          runId: 77,
          conclusion: 'failure',
          containsPr: false,
          ciFastLog: failingLog,
        },
      ],
    });
    expect(result.recurring).toBe(false);
    expect(result.reason).toBe('ci-fast-log-missing');
  });
});
