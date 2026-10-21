import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  attributeAgainstAheadRun,
  normalizeCommandLabel,
  parseCiFastLog,
} from '../merge-group-ahead-attribution.mjs';

const fixture = name =>
  readFileSync(
    resolve(import.meta.dirname, 'fixtures/ahead-attribution', name),
    'utf8'
  );
// Real excerpts of the `ci-fast (remaining)` logs, 2026-10-21:
// ahead = #22328's group (run 39536019717) failed only on the lanes selftest
// flake; poison = #22331's group (run 39536021794) built on that head and
// failed its own external-api-guard ratchet.
const AHEAD_LOG = fixture('ahead-22328-lanes-flake.log');
const POISON_LOG = fixture('poison-22331-api-guard.log');

const failedCiFastJobs = [
  { name: 'ci-fast (remaining)', conclusion: 'failure' },
  { name: 'ci-fast', conclusion: 'failure' },
  { name: 'Product Lane Receipt', conclusion: 'failure' },
  { name: 'PR Ready', conclusion: 'failure' },
  { name: 'Unit Tests (1/4)', conclusion: 'success' },
];

describe('parseCiFastLog', () => {
  it('reads lane statuses, fail-fast skips and structural command results', () => {
    const ahead = parseCiFastLog(AHEAD_LOG);
    expect(ahead.lanes.get('source-guards')?.statuses).toEqual(
      new Set(['skipped'])
    );
    expect(ahead.lanes.get('source-guards')?.failFastSkipped).toBe(false);
    expect(ahead.passedCommands.length).toBeGreaterThan(50);
    expect(
      ahead.failedCommands.every(label => label.startsWith('if python3'))
    ).toBe(true);

    const poison = parseCiFastLog(POISON_LOG);
    expect(poison.lanes.get('source-guards')?.statuses.has('failure')).toBe(
      true
    );
    expect(
      poison.failedCommands.every(label =>
        normalizeCommandLabel(label).startsWith(
          'pnpm exec vitest --root scripts --config vitest.config.mts run lib/__tests__/me'
        )
      )
    ).toBe(true);
  });

  it('strips gh job-log prefixes and timestamps', () => {
    const parsed = parseCiFastLog(
      'ci-fast (remaining)\tRun structural ci-fast lane\t2026-10-21T03:06:40.4322457Z ======== lane: copy-gate ========\n' +
        'ci-fast (remaining)\tRun structural ci-fast lane\t2026-10-21T03:06:40.4322826Z [ci-fast] copy-gate: success (1.0s)'
    );
    expect(parsed.lanes.get('copy-gate')?.statuses).toEqual(
      new Set(['success'])
    );
  });
});

describe('attributeAgainstAheadRun', () => {
  it('attributes #22331 own failure when the completed ahead run proves those signals passed', () => {
    expect(
      attributeAgainstAheadRun({
        currentJobs: failedCiFastJobs,
        aheadJobs: failedCiFastJobs,
        aheadConclusion: 'failure',
        currentCiFastLog: POISON_LOG,
        aheadCiFastLog: AHEAD_LOG,
      })
    ).toEqual({
      attributable: true,
      reason: 'failing-signals-passed-on-ahead-run',
    });
  });

  it('keeps waiting when the failing command never ran on the ahead run (fail-fast)', () => {
    // The structural lane is fail-fast: a command absent from the ahead run's
    // timings proves nothing. Drop the lanes pytest row (#58) from an ahead run
    // and the same failure behind it stays unattributed.
    const stoppedEarly = POISON_LOG.split('\n')
      .filter(line => !line.startsWith('| 58 |'))
      .join('\n');
    expect(stoppedEarly).not.toBe(POISON_LOG);
    const result = attributeAgainstAheadRun({
      currentJobs: failedCiFastJobs,
      aheadJobs: failedCiFastJobs,
      aheadConclusion: 'failure',
      currentCiFastLog: AHEAD_LOG,
      aheadCiFastLog: stoppedEarly,
    });
    expect(result.attributable).toBe(false);
    expect(result.reason).toMatch(
      /^structural-command-unproven-on-base:if python3/
    );
  });

  it.each([['cancelled'], [null], [undefined], ['success']])(
    'keeps waiting unless the ahead run completed as a failure (%s)',
    aheadConclusion => {
      expect(
        attributeAgainstAheadRun({
          currentJobs: failedCiFastJobs,
          aheadJobs: failedCiFastJobs,
          aheadConclusion,
          currentCiFastLog: POISON_LOG,
          aheadCiFastLog: AHEAD_LOG,
        })
      ).toEqual({
        attributable: false,
        reason: 'ahead-run-not-completed-failure',
      });
    }
  );

  it('does not treat a fail-fast skipped lane on the ahead run as evidence', () => {
    const failFastAhead = AHEAD_LOG.replace(
      '======== lane: source-guards ========\n',
      '======== lane: source-guards ========\nskipped: earlier lane failed (fail-fast)\n'
    );
    expect(failFastAhead).not.toBe(AHEAD_LOG);
    expect(
      attributeAgainstAheadRun({
        currentJobs: failedCiFastJobs,
        aheadJobs: failedCiFastJobs,
        aheadConclusion: 'failure',
        currentCiFastLog: POISON_LOG,
        aheadCiFastLog: failFastAhead,
      })
    ).toEqual({
      attributable: false,
      reason: 'lane-unproven-on-base:source-guards',
    });
  });

  it('keeps waiting when the same lane also failed on the ahead run', () => {
    const failedAhead = AHEAD_LOG.replace(
      '[ci-fast] source-guards: skipped (0.0s)',
      '[ci-fast] source-guards: failure (9.0s)'
    );
    expect(
      attributeAgainstAheadRun({
        currentJobs: failedCiFastJobs,
        aheadJobs: failedCiFastJobs,
        aheadConclusion: 'failure',
        currentCiFastLog: POISON_LOG,
        aheadCiFastLog: failedAhead,
      }).reason
    ).toBe('lane-failed-on-ahead-run:source-guards');
  });

  it('attributes a failing job that passed on the ahead run, and only that', () => {
    const current = [
      { name: 'Unit Tests (2/4)', conclusion: 'failure' },
      { name: 'PR Ready', conclusion: 'failure' },
    ];
    const passedAhead = [
      { name: 'Unit Tests (2/4)', conclusion: 'success' },
      { name: 'ci-fast (remaining)', conclusion: 'failure' },
    ];
    expect(
      attributeAgainstAheadRun({
        currentJobs: current,
        aheadJobs: passedAhead,
        aheadConclusion: 'failure',
      })
    ).toEqual({
      attributable: true,
      reason: 'failed-jobs-passed-on-ahead-run',
    });
    expect(
      attributeAgainstAheadRun({
        currentJobs: current,
        aheadJobs: [{ name: 'Unit Tests (2/4)', conclusion: 'skipped' }],
        aheadConclusion: 'failure',
      }).reason
    ).toBe('job-unproven-on-base:Unit Tests (2/4)');
  });

  it('never attributes on aggregate jobs, missing logs or unparsed failures', () => {
    const base = {
      aheadJobs: failedCiFastJobs,
      aheadConclusion: 'failure',
      aheadCiFastLog: AHEAD_LOG,
    };
    expect(
      attributeAgainstAheadRun({
        ...base,
        currentJobs: [{ name: 'PR Ready', conclusion: 'failure' }],
        currentCiFastLog: POISON_LOG,
      }).reason
    ).toBe('no-substantive-failure');
    expect(
      attributeAgainstAheadRun({
        ...base,
        currentJobs: failedCiFastJobs,
        currentCiFastLog: null,
      }).reason
    ).toBe('ci-fast-log-missing');
    expect(
      attributeAgainstAheadRun({
        ...base,
        currentJobs: failedCiFastJobs,
        currentCiFastLog: 'no lane output',
      }).reason
    ).toBe('ci-fast-failure-unparsed');
    expect(
      attributeAgainstAheadRun({
        ...base,
        currentJobs: [{ name: 'ci-fast (remaining)', conclusion: 'timed_out' }],
        currentCiFastLog: POISON_LOG,
      }).reason
    ).toBe('job-not-a-failure:ci-fast (remaining)');
  });
});
