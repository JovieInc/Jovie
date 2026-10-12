import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildNightlyAgentStatusFromSkillDelta } from './nightly-agent-report';
import { parseQuarantineLedger } from './quarantine-ledger';
import { RELIABILITY_DETECTORS } from './reliability-detectors';
import {
  nightlyReliabilityEvents,
  projectReliabilityEntropy,
  type ReliabilityDetectorEvent,
} from './reliability-entropy';

const now = '2026-10-01T01:00:00.000Z';
const event = (
  patch: Partial<ReliabilityDetectorEvent> = {}
): ReliabilityDetectorEvent => ({
  detectorId: 'public-profile-canary',
  observedAt: now,
  sourceRef: 'canary:public_profile:last_run',
  outcome: 'clear',
  findingCount: 0,
  ...patch,
});
const status = () =>
  buildNightlyAgentStatusFromSkillDelta(
    { generatedAt: now, repo: 'jovie', failures: [] },
    {
      workflowConclusion: 'success',
      suites: [
        { lane: 'unit', total: 2, passed: 2, failed: 0, flaky: 0, skipped: 0 },
      ],
    }
  );
const ledger = () =>
  parseQuarantineLedger({
    schemaVersion: 1,
    entries: [],
    retryBudget: {
      unitDefaultRetries: 1,
      quarantineUnitRetries: 2,
      e2eDefaultRetries: 0,
      quarantineE2eRetries: 2,
      maxRetryAttemptsPerCiRun: 160,
      unitShardCount: 6,
    },
  });

describe('reliability entropy projection', () => {
  it('waits for workflow success and keeps publication safe when ledger evidence is unavailable', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'jovie-entropy-publish-'));
    const web = join(tmp, 'apps/web');
    const script = join(web, 'scripts/nightly-test-agent.ts');
    const input = join(tmp, 'incoming');
    const output = join(tmp, 'out');
    mkdirSync(join(web, 'scripts'), { recursive: true });
    mkdirSync(join(web, 'tests'));
    mkdirSync(input);
    writeFileSync(join(tmp, 'package.json'), '{"type":"module"}');
    writeFileSync(join(tmp, 'pnpm-workspace.yaml'), 'packages: []\n');
    copyFileSync(resolve('scripts/nightly-test-agent.ts'), script);
    copyFileSync(
      resolve('scripts/nightly-test-agent-root.ts'),
      join(web, 'scripts/nightly-test-agent-root.ts')
    );
    symlinkSync(resolve('node_modules'), join(web, 'node_modules'), 'dir');
    const quarantine = join(web, 'tests/quarantine.json');
    writeFileSync(quarantine, JSON.stringify(ledger().ledger));
    writeFileSync(
      join(input, 'normalized-results.json'),
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        repo: 'jovie',
        inputs: [],
        warnings: [],
        suites: [
          {
            lane: 'unit',
            total: 2,
            passed: 2,
            failed: 0,
            flaky: 0,
            skipped: 0,
            durationMs: 1,
          },
        ],
        failures: [],
      })
    );
    const run = (command: string, ...args: string[]) =>
      execFileSync(
        process.execPath,
        [
          '--import',
          'tsx',
          script,
          command,
          '--repo',
          'jovie',
          '--input-dir',
          input,
          '--out',
          output,
          ...args,
        ],
        {
          cwd: process.cwd(),
          timeout: 15_000,
          stdio: 'pipe',
          env: {
            ...process.env,
            UPSTASH_REDIS_REST_URL: '',
            UPSTASH_REDIS_REST_TOKEN: '',
          },
        }
      );
    const outcomes = () =>
      JSON.parse(readFileSync(join(output, 'skill-delta.json'), 'utf8'))
        .entropyProjection.summary;
    try {
      run('emit-delta');
      expect(outcomes()).toEqual({ clear: 1, attention: 0, unknown: 6 });
      run('publish-status', '--workflow-conclusion', 'cancelled');
      expect(outcomes()).toEqual({ clear: 1, attention: 0, unknown: 6 });
      run('publish-status', '--workflow-conclusion', 'success');
      expect(outcomes()).toEqual({ clear: 2, attention: 0, unknown: 5 });
      rmSync(quarantine);
      run('publish-status', '--workflow-conclusion', 'success');
      expect(outcomes()).toEqual({ clear: 1, attention: 0, unknown: 6 });
      writeFileSync(quarantine, 'not JSON');
      run('publish-status', '--workflow-conclusion', 'success');
      expect(outcomes()).toEqual({ clear: 1, attention: 0, unknown: 6 });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('emits the composed receipt through the existing report command and artifact', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'jovie-entropy-test-'));
    const input = join(tmp, 'incoming');
    mkdirSync(input);
    const fixture = {
      generatedAt: new Date().toISOString(),
      repo: 'jovie',
      inputs: [],
      warnings: [],
      suites: [
        {
          lane: 'unit',
          total: 2,
          passed: 1,
          failed: 1,
          flaky: 0,
          skipped: 0,
          durationMs: 1,
        },
      ],
      failures: [
        {
          repo: 'jovie',
          testId: 'fixture-failure',
          lane: 'unit',
          fingerprint: 'fixture-1',
          createdAt: now,
        },
      ],
    };
    try {
      const cases = [
        ['jovie', fixture.generatedAt],
        ['ops', fixture.generatedAt],
        ['jovie', '2000-01-01T00:00:00.000Z'],
        ['jovie', 'invalid'],
      ];
      for (const [repo, observedAt] of cases) {
        writeFileSync(
          join(input, 'normalized-results.json'),
          JSON.stringify({ ...fixture, generatedAt: observedAt })
        );
        const output = join(tmp, repo);
        execFileSync(
          process.execPath,
          [
            '--import',
            'tsx',
            resolve('scripts/nightly-test-agent.ts'),
            'emit-delta',
            '--repo',
            repo,
            '--input-dir',
            input,
            '--out',
            output,
          ],
          { cwd: process.cwd(), timeout: 15_000, stdio: 'pipe' }
        );
        const delta = JSON.parse(
          readFileSync(join(output, 'skill-delta.json'), 'utf8')
        );
        expect(delta.failures[0].fingerprint).toBe('fixture-1');
        if (repo === 'jovie') {
          expect(delta.entropyProjection.schema).toBe(
            'jovie-reliability-entropy/v1'
          );
          const fresh = observedAt === fixture.generatedAt;
          expect(delta.entropyProjection.summary.unknown).toBe(fresh ? 5 : 6);
          expect(
            delta.entropyProjection.detectors.find(
              (item: { detectorId: string }) =>
                item.detectorId === 'nightly-testing-agent'
            )
          ).toMatchObject({
            outcome: fresh ? 'attention' : 'unknown',
            findingCount: fresh ? 1 : null,
            reason: fresh
              ? 'detector-result'
              : observedAt === 'invalid'
                ? 'invalid-result'
                : 'stale-result',
          });
          if (fresh)
            expect(
              delta.entropyProjection.detectors.find(
                (item: { detectorId: string }) =>
                  item.detectorId === 'nightly-testing-agent'
              ).sourceRefs
            ).toEqual([expect.stringContaining('skill-delta.json')]);
        } else {
          expect(delta).not.toHaveProperty('entropyProjection');
        }
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('shows every registered detector as unknown without actual result evidence', () => {
    const output = projectReliabilityEntropy([], now);
    expect(output.detectors.map(item => item.detectorId)).toEqual(
      RELIABILITY_DETECTORS.map(item => item.id)
    );
    expect(output.summary).toEqual({ clear: 0, attention: 0, unknown: 7 });
    expect(
      output.detectors.every(
        item => item.reason === 'missing-result' && item.findingCount === null
      )
    ).toBe(true);
  });

  it('composes all registered detector results and retains their provenance', () => {
    const events = RELIABILITY_DETECTORS.map((detector, index) =>
      event({
        detectorId: detector.id,
        sourceRef: detector.artifacts[0],
        outcome: index === 1 ? 'attention' : 'clear',
        findingCount: index === 1 ? 2 : 0,
      })
    );
    const output = projectReliabilityEntropy(events, now);
    expect(output.summary).toEqual({ clear: 6, attention: 1, unknown: 0 });
    expect(output.detectors[1]).toMatchObject({
      sourceIssue: 'JOV-1871',
      findingCount: 2,
      sourceRefs: [RELIABILITY_DETECTORS[1].artifacts[0]],
    });
  });

  it('is deterministic under duplicate and out-of-order delivery and normalizes timestamps', () => {
    const older = event({
      observedAt: '2026-10-01T00:00:00Z',
      outcome: 'attention',
      findingCount: 1,
    });
    const current = event();
    const duplicate = event({ observedAt: '2026-09-30T18:00:00-07:00' });
    expect(projectReliabilityEntropy([older, current, duplicate], now)).toEqual(
      projectReliabilityEntropy([duplicate, current, older, current], now)
    );
    expect(
      projectReliabilityEntropy([older, current], now).detectors[0].outcome
    ).toBe('clear');
  });

  it.each([
    ['invalid-result', { observedAt: 'invalid' }],
    ['invalid-result', { observedAt: '2026-10-01T02:00:00Z' }],
    ['invalid-result', { sourceRef: ' ' }],
    ['invalid-result', { findingCount: -1 }],
    ['invalid-result', { findingCount: 1 }],
    ['stale-result', { observedAt: '2026-09-28T00:00:00Z' }],
    ['unverified-result', { outcome: 'unknown' as const }],
  ])('does not convert %s into a passing detector', (reason, patch) => {
    const result = projectReliabilityEntropy([event(patch)], now).detectors[0];
    expect(result).toMatchObject({
      outcome: 'unknown',
      reason,
      findingCount: null,
    });
  });

  it('keeps conflicting simultaneous receipts unknown and rejects unregistered detectors', () => {
    const events = [
      event(),
      event({
        outcome: 'attention',
        findingCount: 1,
        sourceRef: 'second-receipt',
      }),
      event({ detectorId: 'invented-detector' }),
    ];
    const output = projectReliabilityEntropy(events, now);
    expect(output.detectors[0]).toMatchObject({
      outcome: 'unknown',
      reason: 'conflicting-results',
      sourceRefs: ['canary:public_profile:last_run', 'second-receipt'],
    });
    expect(output.rejectedResultCount).toBe(1);
    expect(output).toEqual(
      projectReliabilityEntropy([...events].reverse(), now)
    );
  });

  it('rejects an invalid projection clock or freshness bound', () => {
    expect(() => projectReliabilityEntropy([], 'invalid')).toThrow(
      'valid time'
    );
    expect(() => projectReliabilityEntropy([], now, 0)).toThrow(
      'freshness window'
    );
  });

  it('projects the existing nightly and quarantine outputs without claiming other runs', () => {
    const result = projectReliabilityEntropy(
      nightlyReliabilityEvents(status(), ledger()),
      now
    );
    expect(result.summary).toEqual({ clear: 2, attention: 0, unknown: 5 });
    expect(
      result.detectors.find(item => item.detectorId === 'nightly-testing-agent')
    ).toMatchObject({
      outcome: 'clear',
      sourceRefs: ['docs/NIGHTLY_TESTING_AGENT_REPORT.md'],
    });
  });

  it.each(['cancelled', 'timed_out'] as const)(
    'does not pass a %s nightly run',
    workflowConclusion => {
      const value = {
        ...status(),
        workflowConclusion,
        workflowRunUrl: 'https://github.com/JovieInc/Jovie/actions/runs/1',
      };
      expect(nightlyReliabilityEvents(value, null)[0]).toMatchObject({
        outcome: 'unknown',
        sourceRef: value.workflowRunUrl,
      });
    }
  );

  it('keeps empty or invalid nightly execution unknown and reports actual failures and flakes', () => {
    const value = status();
    expect(
      nightlyReliabilityEvents({ ...value, suites: [] }, null)[0].outcome
    ).toBe('unknown');
    expect(
      nightlyReliabilityEvents(
        { ...value, workflowConclusion: undefined },
        null
      )[0].outcome
    ).toBe('unknown');
    expect(
      nightlyReliabilityEvents({ ...value, failureCount: -1 }, null)[0].outcome
    ).toBe('unknown');
    expect(
      nightlyReliabilityEvents(
        { ...value, failureCount: 3, pass: false },
        null
      )[0]
    ).toMatchObject({ outcome: 'attention', findingCount: 3 });
    expect(
      nightlyReliabilityEvents(
        { ...value, workflowConclusion: 'failure' },
        null
      )[0].outcome
    ).toBe('attention');
    value.suites[0].flaky = 1;
    expect(nightlyReliabilityEvents(value, null)[0]).toMatchObject({
      outcome: 'attention',
      findingCount: 1,
    });
    value.suites[0].failed = Number.NaN;
    expect(nightlyReliabilityEvents(value, null)[0]).toMatchObject({
      outcome: 'unknown',
      findingCount: 0,
    });
  });

  it('preserves ledger debt, validation failures and missing input without treating them as clean', () => {
    expect(nightlyReliabilityEvents(status(), null)).toHaveLength(1);
    for (const changed of [
      { activeCount: 2 },
      { expiredCount: 1 },
      { withinRetryBudget: false },
    ]) {
      const value = ledger();
      expect(
        nightlyReliabilityEvents(status(), {
          ...value,
          summary: { ...value.summary, ...changed },
        })[1].outcome
      ).toBe('attention');
    }
    expect(
      nightlyReliabilityEvents(status(), parseQuarantineLedger(null))[1].outcome
    ).toBe('attention');
  });
});
