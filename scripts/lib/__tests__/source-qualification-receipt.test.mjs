import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildQualificationReceipt,
  computeQualificationFingerprint,
  evaluateQualificationReuse,
  QUALIFICATION_RECEIPT_MAX_AGE_MS,
  QUALIFICATION_WORKFLOW_PATH,
  SOURCE_QUALIFICATION_SCHEMA,
  summarizeQualificationFlights,
  validateQualificationFingerprintInput,
} from '../source-qualification-receipt.mjs';

const HEAD = 'b526652cafa6333dbd1eb0fa3d408e84ea05f675';
const BASE = '4d1e0bfa3d408e84e05f672cafa6333bd1eb0fa3';
const TREE = '7c31a9f0e2b48d1a6f3c5e9b7d2a4f8c1e0b9d3a';
const TOOLCHAIN =
  '5e8f2c1a9b7d3f4e5e8f2c1a9b7d3f4e5e8f2c1a9b7d3f4e5e8f2c1a9b7d3f4e';
const POLICY =
  '2a4c6e8b0d2f4a6c2a4c6e8b0d2f4a6c2a4c6e8b0d2f4a6c2a4c6e8b0d2f4a6c';
const FINGERPRINT = {
  headSha: HEAD,
  baseSha: BASE,
  mergedTreeOid: TREE,
  toolchainDigest: TOOLCHAIN,
  policyDigest: POLICY,
};
const REPOSITORY = 'JovieInc/Jovie';
const NOW = Date.parse('2026-11-02T10:30:00Z');

const greenRun = (id = 41421368937, overrides = {}) => ({
  id,
  run_attempt: 1,
  status: 'completed',
  conclusion: 'success',
  head_sha: HEAD,
  path: QUALIFICATION_WORKFLOW_PATH,
  event: 'pull_request',
  ...overrides,
});

const receiptAt = (issuedAt, overrides = {}) =>
  buildQualificationReceipt({
    ...FINGERPRINT,
    runId: 41421368937,
    runAttempt: 1,
    repository: REPOSITORY,
    issuedAt,
    ...overrides,
  });

const reuse = options =>
  evaluateQualificationReuse({ now: () => NOW, ...options });

describe('qualification fingerprints', () => {
  it('hashes the exact identity deterministically and independently of key order', () => {
    const one = computeQualificationFingerprint(FINGERPRINT);
    const two = computeQualificationFingerprint({
      policyDigest: POLICY,
      toolchainDigest: TOOLCHAIN,
      mergedTreeOid: TREE,
      baseSha: BASE,
      headSha: HEAD,
    });
    expect(one).toMatch(/^[0-9a-f]{64}$/);
    expect(two).toBe(one);
  });

  it('rejects every invalid component by name', () => {
    const verdict = validateQualificationFingerprintInput({
      headSha: 'short',
      baseSha: BASE,
      mergedTreeOid: 'z'.repeat(40),
      toolchainDigest: 'not-hex',
      policyDigest: undefined,
    });
    expect(verdict.errors).toEqual([
      'fingerprint-input:head',
      'fingerprint-input:mergedTree',
      'fingerprint-input:toolchain',
      'fingerprint-input:policy',
    ]);
    expect(computeQualificationFingerprint({ headSha: 'short' })).toBeNull();
  });

  it('ignores PR metadata: title, body and labels never change the fingerprint', () => {
    const base = computeQualificationFingerprint(FINGERPRINT);
    const withMetadata = {
      ...FINGERPRINT,
      title: 'fix(marketing): different',
      body: 'a completely rewritten body',
      labels: ['priority:marketing', 'autonomous-merges-v1'],
    };
    expect(computeQualificationFingerprint(withMetadata)).toBe(base);
  });
});

describe('qualification reuse verdicts', () => {
  it('allows reuse only for an exact match backed by a completed green run', () => {
    const verdict = reuse({
      receipt: receiptAt('2026-11-02T10:00:00Z'),
      expected: FINGERPRINT,
      run: greenRun(),
    });
    expect(verdict.allowed).toBe(true);
    expect(verdict.blockers).toEqual([]);
    expect(verdict.fingerprint).toBe(
      computeQualificationFingerprint(FINGERPRINT)
    );
  });

  /** @type {[string, Record<string, string>, string][]} changed identity components fail closed */
  const changedIdentity = [
    ['head', { headSha: '7'.repeat(40) }, 'fingerprint-mismatch:head'],
    ['base advanced', { baseSha: '8'.repeat(40) }, 'fingerprint-mismatch:base'],
    [
      'merged tree',
      { mergedTreeOid: '9'.repeat(40) },
      'fingerprint-mismatch:mergedTree',
    ],
    [
      'toolchain',
      { toolchainDigest: 'a'.repeat(64) },
      'fingerprint-mismatch:toolchain',
    ],
    ['policy', { policyDigest: 'b'.repeat(64) }, 'fingerprint-mismatch:policy'],
  ];
  for (const [name, expectedOverrides, blocker] of changedIdentity) {
    it(`fails closed when the ${name} changed`, () => {
      const verdict = reuse({
        receipt: receiptAt('2026-11-02T10:00:00Z'),
        expected: { ...FINGERPRINT, ...expectedOverrides },
        run: greenRun(),
      });
      expect(verdict.allowed).toBe(false);
      expect(verdict.blockers).toContain(blocker);
    });
  }

  it('rejects a tampered receipt whose fields disagree with its fingerprint', () => {
    const receipt = receiptAt('2026-11-02T10:00:00Z');
    receipt.base = '8'.repeat(40);
    const verdict = reuse({ receipt, expected: FINGERPRINT, run: greenRun() });
    expect(verdict.blockers).toContain('fingerprint-inconsistent');
    expect(verdict.blockers).toContain('fingerprint-mismatch:base');
    expect(verdict.allowed).toBe(false);
  });

  /**
   * @type {[string, () => unknown, string][]} malformed and missing proof
   * shapes, each paired with its fail-closed blocker.
   */
  const malformedReceipts = [
    ['missing receipt', () => null, 'receipt-missing'],
    ['undefined receipt', () => undefined, 'receipt-missing'],
    [
      'non-object receipt',
      () => 'jovie-source-qualification/v1',
      'receipt-malformed',
    ],
    [
      'wrong schema',
      () => ({ ...receiptAt('2026-11-02T10:00:00Z'), schema: 'other/v9' }),
      'receipt-malformed',
    ],
    [
      'short fingerprint',
      () => ({ ...receiptAt('2026-11-02T10:00:00Z'), fingerprint: 'abc' }),
      'receipt-malformed',
    ],
    [
      'missing run id',
      () => {
        const receipt = receiptAt('2026-11-02T10:00:00Z');
        delete receipt.runId;
        return receipt;
      },
      'receipt-malformed',
    ],
    [
      'non-ISO issuedAt',
      () => {
        const receipt = receiptAt('2026-11-02T10:00:00Z');
        receipt.issuedAt = '2026-11-02 10:00:00';
        return receipt;
      },
      'receipt-malformed',
    ],
    [
      'bad repository',
      () => {
        const receipt = receiptAt('2026-11-02T10:00:00Z');
        receipt.repository = 'not a repo';
        return receipt;
      },
      'receipt-malformed',
    ],
  ];
  for (const [name, makeReceipt, blocker] of malformedReceipts) {
    it(`rejects ${name}`, () => {
      const verdict = reuse({
        receipt: makeReceipt(),
        expected: FINGERPRINT,
        run: greenRun(),
      });
      expect(verdict.blockers).toContain(blocker);
      expect(verdict.allowed).toBe(false);
    });
  }

  it('rejects malformed expected identity without a fingerprint', () => {
    const verdict = reuse({
      receipt: receiptAt('2026-11-02T10:00:00Z'),
      expected: { headSha: 'short' },
      run: greenRun(),
    });
    expect(verdict.blockers).toEqual(['expected-malformed']);
    expect(verdict.fingerprint).toBeNull();
  });

  it('rejects stale and future-dated receipts', () => {
    const stale = reuse({
      receipt: receiptAt(
        new Date(NOW - QUALIFICATION_RECEIPT_MAX_AGE_MS - 1000).toISOString()
      ),
      expected: FINGERPRINT,
      run: greenRun(),
    });
    expect(stale.blockers).toContain('receipt-expired');
    const future = reuse({
      receipt: receiptAt(new Date(NOW + 60_000).toISOString()),
      expected: FINGERPRINT,
      run: greenRun(),
    });
    expect(future.blockers).toContain('receipt-expired');
    expect(
      reuse({
        receipt: receiptAt(new Date(NOW - 1000).toISOString()),
        expected: FINGERPRINT,
        run: greenRun(),
      }).allowed
    ).toBe(true);
  });

  /** @type {[string, import('../source-qualification-receipt.mjs').QualificationRunEvidence | null][]} run-evidence failures */
  const runFailures = [
    [
      'in-flight predecessor',
      greenRun(41421368937, { status: 'in_progress', conclusion: null }),
    ],
    [
      'queued predecessor',
      greenRun(41421368937, { status: 'queued', conclusion: null }),
    ],
    ['failed execution', greenRun(41421368937, { conclusion: 'failure' })],
    ['cancelled execution', greenRun(41421368937, { conclusion: 'cancelled' })],
    ['different run', greenRun(41426440963)],
    ['different attempt', greenRun(41421368937, { run_attempt: 2 })],
    ['different head', greenRun(41421368937, { head_sha: '7'.repeat(40) })],
    [
      'different workflow',
      greenRun(41421368937, { path: '.github/workflows/ci.yml' }),
    ],
    ['merge-group event', greenRun(41421368937, { event: 'merge_group' })],
    ['missing run', null],
  ];
  for (const [name, run] of runFailures) {
    it(`rejects ${name}`, () => {
      const verdict = reuse({
        receipt: receiptAt('2026-11-02T10:00:00Z'),
        expected: FINGERPRINT,
        run,
      });
      expect(verdict.allowed).toBe(false);
      expect(verdict.blockers.length).toBeGreaterThan(0);
    });
  }

  it('never allows reuse without run evidence naming the exact green run', () => {
    for (const run of [
      null,
      undefined,
      greenRun(41421368937, { conclusion: 'failure' }),
    ]) {
      const verdict = reuse({
        receipt: receiptAt('2026-11-02T10:00:00Z'),
        expected: FINGERPRINT,
        run,
      });
      expect(verdict.allowed).toBe(false);
    }
    const allowed = reuse({
      receipt: receiptAt('2026-11-02T10:00:00Z'),
      expected: FINGERPRINT,
      run: greenRun(),
    });
    expect(allowed.allowed).toBe(true);
    expect(allowed.fingerprint).toBe(
      computeQualificationFingerprint(FINGERPRINT)
    );
  });
});

describe('flight bursts', () => {
  /**
   * Drive a sequence of pull_request events through the reuse gate. Each
   * heavy flight publishes its receipt after completing green, exactly like
   * the workflow half will. Returns per-flight heavy decisions.
   * @param {Array<{event: string, expected: object}>} events
   */
  const fly = events => {
    let receipt = null;
    let run = null;
    const flights = [];
    for (const { event, expected } of events) {
      const verdict = reuse({ receipt, expected, run });
      const heavy = !verdict.allowed;
      flights.push({ event, heavy });
      if (heavy) {
        run = greenRun(41421368937 + flights.length);
        receipt = buildQualificationReceipt({
          ...expected,
          runId: run.id,
          runAttempt: 1,
          repository: REPOSITORY,
          issuedAt: new Date(NOW).toISOString(),
        });
      }
    }
    return flights;
  };

  it('five identical events (open, label, edits) cause exactly one heavy qualification', () => {
    const flights = fly([
      { event: 'opened', expected: FINGERPRINT },
      { event: 'labeled', expected: FINGERPRINT },
      { event: 'edited', expected: FINGERPRINT },
      { event: 'edited', expected: FINGERPRINT },
      { event: 'unlabeled', expected: FINGERPRINT },
    ]);
    expect(flights).toEqual([
      { event: 'opened', heavy: true },
      { event: 'labeled', heavy: false },
      { event: 'edited', heavy: false },
      { event: 'edited', heavy: false },
      { event: 'unlabeled', heavy: false },
    ]);
  });

  it('a same-second opened+labeled burst still qualifies exactly once', () => {
    // PR #24271's shape: the labeled flight runs while the opened flight is
    // still in flight, so no completed proof exists yet for it either.
    const events = [
      { event: 'opened', expected: FINGERPRINT },
      { event: 'labeled', expected: FINGERPRINT },
    ];
    let receipt = null;
    const run = greenRun();
    // First flight: no receipt, and the predecessor run has not completed.
    const first = reuse({
      receipt: null,
      expected: FINGERPRINT,
      run: { ...run, status: 'in_progress', conclusion: null },
    });
    expect(first.allowed).toBe(false);
    // The opened flight completes green and publishes its receipt; the queued
    // labeled flight starts afterwards and reuses the exact qualification.
    receipt = buildQualificationReceipt({
      ...FINGERPRINT,
      runId: run.id,
      runAttempt: 1,
      repository: REPOSITORY,
      issuedAt: new Date(NOW).toISOString(),
    });
    const second = reuse({ receipt, expected: FINGERPRINT, run });
    expect(second.allowed).toBe(true);
    expect(events.length).toBe(2);
  });

  it('base advancement mid-burst re-qualifies exactly once for the new base', () => {
    const advancedBase = { ...FINGERPRINT, baseSha: '8'.repeat(40) };
    const flights = fly([
      { event: 'opened', expected: FINGERPRINT },
      { event: 'labeled', expected: FINGERPRINT },
      { event: 'edited', expected: advancedBase },
      { event: 'edited', expected: advancedBase },
      { event: 'unlabeled', expected: advancedBase },
    ]);
    expect(flights).toEqual([
      { event: 'opened', heavy: true },
      { event: 'labeled', heavy: false },
      { event: 'edited', heavy: true },
      { event: 'edited', heavy: false },
      { event: 'unlabeled', heavy: false },
    ]);
  });

  it('changed bodies and labels reuse the tree qualification; only the fingerprint gates', () => {
    const receipt = receiptAt('2026-11-02T10:00:00Z');
    const reusing = reuse({
      receipt,
      expected: {
        ...FINGERPRINT,
        title: 'new title after edit',
        body: 'final body with the changelog marker',
        labels: ['priority:marketing'],
      },
      run: greenRun(),
    });
    expect(reusing.allowed).toBe(true);
  });
});

describe('measured bursts (JOV-10354 before state)', () => {
  // Verified from the GitHub Actions API on 2026-11-02: five Source
  // Validation flights on PR #24266 at one unchanged head, and the two
  // flights one `pr:open open --draft --label priority:marketing` fired for
  // PR #24271 one second apart. Every flight re-ran the ~10-minute
  // trusted-base merged-tree qualification in the deterministic job.
  const pr24266 = [
    {
      event: 'opened',
      createdAt: '2026-11-02T09:31:32Z',
      completedAt: '2026-11-02T09:42:07Z',
      heavy: true,
      heavyMinutes: 10.3,
    },
    {
      event: 'labeled',
      createdAt: '2026-11-02T09:31:32Z',
      completedAt: '2026-11-02T09:52:40Z',
      heavy: true,
      heavyMinutes: 10.2,
    },
    {
      event: 'edited',
      createdAt: '2026-11-02T09:31:36Z',
      completedAt: '2026-11-02T10:03:10Z',
      heavy: true,
      heavyMinutes: 10.1,
    },
    {
      event: 'edited',
      createdAt: '2026-11-02T09:43:43Z',
      completedAt: '2026-11-02T10:13:56Z',
      heavy: true,
      heavyMinutes: 10.5,
    },
    {
      event: 'unlabeled',
      createdAt: '2026-11-02T09:43:45Z',
      completedAt: '2026-11-02T10:25:00Z',
      heavy: true,
      heavyMinutes: 10.4,
    },
  ];
  const pr24271 = [
    {
      event: 'labeled',
      createdAt: '2026-11-02T10:09:07Z',
      completedAt: '2026-11-02T10:17:06Z',
      heavy: true,
      heavyMinutes: 7.8,
    },
    {
      event: 'opened',
      createdAt: '2026-11-02T10:09:08Z',
      completedAt: '2026-11-02T10:24:59Z',
      heavy: true,
      heavyMinutes: 7.6,
    },
  ];

  it('summarizes the PR #24266 burst: five heavy flights, ~41 redundant heavy minutes', () => {
    const summary = summarizeQualificationFlights(pr24266);
    expect(summary.n).toBe(5);
    expect(summary.heavyQualifications).toBe(5);
    expect(summary.redundantHeavyQualifications).toBe(4);
    expect(summary.redundantHeavyMinutes).toBeCloseTo(41.2, 1);
    // 635, 1268, 1813, 1894, 2475 seconds; nearest-rank p50/p95.
    expect(summary.eventToAdmissionSeconds.p50).toBe(1813);
    expect(summary.eventToAdmissionSeconds.p95).toBe(2475);
    expect(summary.burstAdmissionSeconds).toBe(3208);
  });

  it('summarizes the PR #24271 burst: one command, two full qualifications', () => {
    const summary = summarizeQualificationFlights(pr24271);
    expect(summary.n).toBe(2);
    expect(summary.heavyQualifications).toBe(2);
    expect(summary.redundantHeavyQualifications).toBe(1);
    expect(summary.redundantHeavyMinutes).toBeCloseTo(7.6, 1);
    expect(summary.eventToAdmissionSeconds.p50).toBe(479);
  });

  it('the same bursts with exact-fingerprint reuse collapse to one heavy qualification each', () => {
    const after24266 = pr24266.map((flight, index) => ({
      ...flight,
      heavy: index === 0,
      heavyMinutes: index === 0 ? 10.3 : 0,
    }));
    expect(summarizeQualificationFlights(after24266)).toMatchObject({
      n: 5,
      heavyQualifications: 1,
      redundantHeavyQualifications: 0,
      redundantHeavyMinutes: 0,
    });
    const after24271 = pr24271.map((flight, index) => ({
      ...flight,
      heavy: index === 0,
      heavyMinutes: index === 0 ? 7.8 : 0,
    }));
    expect(summarizeQualificationFlights(after24271)).toMatchObject({
      n: 2,
      heavyQualifications: 1,
      redundantHeavyQualifications: 0,
    });
  });

  it('ignores flights with unparseable timestamps instead of averaging them in', () => {
    const summary = summarizeQualificationFlights([
      ...pr24271,
      {
        event: 'edited',
        createdAt: 'not-a-time',
        completedAt: '2026-11-02T10:30:00Z',
        heavy: true,
      },
    ]);
    expect(summary.n).toBe(2);
    expect(summarizeQualificationFlights([]).n).toBe(0);
    expect(summarizeQualificationFlights(null).n).toBe(0);
  });
});

describe('CLI', () => {
  const root = () => mkdtempSync(join(tmpdir(), 'source-qualification-'));
  /** @param {string[]} args */
  const run = args => {
    const result = spawnSync(
      process.execPath,
      [
        join(import.meta.dirname, '..', 'source-qualification-receipt.mjs'),
        ...args,
      ],
      { encoding: 'utf8' }
    );
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  };

  it('builds and validates a receipt round-trip, and blocks a tampered expectation', () => {
    const dir = root();
    try {
      const built = run([
        'build',
        '--head',
        HEAD,
        '--base',
        BASE,
        '--tree',
        TREE,
        '--toolchain',
        TOOLCHAIN,
        '--policy',
        POLICY,
        '--run-id',
        '41421368937',
        '--run-attempt',
        '1',
        '--repository',
        REPOSITORY,
        '--issued-at',
        new Date().toISOString(),
      ]);
      expect(built.status).toBe(0);
      const receipt = JSON.parse(built.stdout);
      expect(receipt.schema).toBe(SOURCE_QUALIFICATION_SCHEMA);
      const receiptPath = join(dir, 'receipt.json');
      const expectedPath = join(dir, 'expected.json');
      const runPath = join(dir, 'run.json');
      writeFileSync(receiptPath, JSON.stringify(receipt));
      writeFileSync(expectedPath, JSON.stringify(FINGERPRINT));
      writeFileSync(runPath, JSON.stringify(greenRun()));
      const fingerprint = JSON.parse(
        run([
          'fingerprint',
          '--head',
          HEAD,
          '--base',
          BASE,
          '--tree',
          TREE,
          '--toolchain',
          TOOLCHAIN,
          '--policy',
          POLICY,
        ]).stdout
      ).fingerprint;
      expect(receipt.fingerprint).toBe(fingerprint);
      const allowedRun = run([
        'validate',
        '--receipt-file',
        receiptPath,
        '--expected-file',
        expectedPath,
        '--run-file',
        runPath,
        '--max-age-ms',
        String(QUALIFICATION_RECEIPT_MAX_AGE_MS),
      ]);
      expect(allowedRun.status).toBe(0);
      const verdict = JSON.parse(allowedRun.stdout);
      expect(verdict.allowed).toBe(true);
      // A base advancement through the same CLI path exits blocked.
      writeFileSync(
        expectedPath,
        JSON.stringify({ ...FINGERPRINT, baseSha: '8'.repeat(40) })
      );
      const blockedRun = run([
        'validate',
        '--receipt-file',
        receiptPath,
        '--expected-file',
        expectedPath,
        '--run-file',
        runPath,
      ]);
      expect(blockedRun.status).toBe(1);
      const blocked = JSON.parse(blockedRun.stdout);
      expect(blocked.allowed).toBe(false);
      expect(blocked.blockers).toContain('fingerprint-mismatch:base');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails closed on unreadable receipt input', () => {
    const dir = root();
    try {
      const expectedPath = join(dir, 'expected.json');
      writeFileSync(expectedPath, JSON.stringify(FINGERPRINT));
      const unreadable = run([
        'validate',
        '--receipt-file',
        join(dir, 'missing.json'),
        '--expected-file',
        expectedPath,
        '--run-file',
        expectedPath,
      ]);
      expect(unreadable.status).toBe(1);
      expect(unreadable.stderr).toMatch(/receipt unreadable/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
