import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { apply } from '../../main-red-eject.mjs';

vi.mock('../../../packages/api-client/gh.ts', () => ({
  runGh: vi.fn(() => {
    throw new Error('unexpected GitHub call');
  }),
}));

import {
  attributeCulprit,
  bisectFirstRed,
  checkKey,
  classifyEvidence,
  decideEject,
  detectConsecutiveGroupFailure,
  detectStuckHead,
  failureSignature,
  isRevertSubject,
  parsePrNumber,
  planJump,
  titles,
  verifyJump,
} from '../main-red-eject.mjs';

const CENSUS_LOG = [
  '##[error]Structural command 34/61 failed (exit 1). Command: pnpm exec vitest --root scripts run lib/__tests__/me… | Error: x',
  'FAIL   workspace-scripts  lib/__tests__/design-surface-census.test.mjs > the checked-in census covers the real page tree',
  '##[error]Guardrails (proxy) failed. Fix: pnpm next:proxy-guard',
].join('\n');
const sig = failureSignature([CENSUS_LOG]);
const commit = (sha, evidence) => ({ sha, evidence });
const here = dirname(fileURLToPath(import.meta.url));

describe('failureSignature', () => {
  it('names the failing test file, not the truncated command', () => {
    expect(sig).toContain('test:lib/__tests__/design-surface-census.test.mjs');
    expect(checkKey(sig)).toBe(
      'test:lib/__tests__/design-surface-census.test.mjs'
    );
  });
});

describe('detectConsecutiveGroupFailure', () => {
  const group = (id, conclusion, signature) => ({ id, conclusion, signature });
  it('triggers on the same failure in two consecutive groups', () => {
    expect(
      detectConsecutiveGroupFailure([
        group(2, 'failure', sig),
        group(1, 'failure', sig),
      ]).triggered
    ).toBe(true);
  });
  it('ignores cancelled groups and unrelated failures', () => {
    expect(
      detectConsecutiveGroupFailure([
        group(3, 'failure', sig),
        group(2, 'cancelled', []),
        group(1, 'failure', ['test:other.test.mjs']),
      ]).triggered
    ).toBe(false);
  });
  it('does not trigger on a single failure', () => {
    expect(
      detectConsecutiveGroupFailure([group(1, 'failure', sig)]).triggered
    ).toBe(false);
  });
});

describe('attributeCulprit', () => {
  it('finds the first red even when a later docs-only head is falsely green (#23600)', () => {
    const r = attributeCulprit([
      commit('a', 'green'),
      commit('b', 'other'),
      commit('c', 'red'),
      commit('d', 'red'),
      commit('e', 'green'),
    ]);
    // b failed for another reason: no proof either way, so it is a bisect candidate
    expect(r.status).toBe('ambiguous');
    expect(r.culprit.sha).toBe('c');
    expect(r.candidates.map(c => c.sha)).toEqual(['b', 'c']);
  });
  it('is attributed when the predecessor is proven green', () => {
    const r = attributeCulprit([
      commit('a', 'green'),
      commit('c', 'red'),
      commit('d', 'red'),
    ]);
    expect(r).toMatchObject({ status: 'attributed', culprit: { sha: 'c' } });
  });
  it('bisects ambiguous candidates', async () => {
    const list = ['u1', 'u2', 'u3', 'bad', 'bad2'].map(sha => ({ sha }));
    const { culprit, probes } = await bisectFirstRed(list, async sha =>
      sha.startsWith('bad') ? 'red' : 'green'
    );
    expect(culprit.sha).toBe('bad');
    expect(probes.length).toBeLessThanOrEqual(3);
  });
  it('classifies evidence against the signature', () => {
    expect(
      classifyEvidence({ conclusion: 'failure', signature: sig }, sig)
    ).toBe('red');
    expect(
      classifyEvidence(
        { conclusion: 'failure', signature: ['test:z.test.mjs'] },
        sig
      )
    ).toBe('other');
    expect(classifyEvidence({ conclusion: 'success' }, sig)).toBe('green');
    expect(classifyEvidence(undefined, sig)).toBe('unknown');
  });
});

describe('decideEject', () => {
  const culprit = {
    sha: 'c',
    pr: 23600,
    subject: 'feat(marketing): x (#23600)',
  };
  const base = {
    culprit,
    check: 'test:a',
    now: Date.parse('2026-10-29T20:00:00Z'),
  };
  it('reverts an attributed culprit', () => {
    expect(decideEject(base).action).toBe('revert');
  });
  it('dry mode never reverts and off skips', () => {
    expect(decideEject({ ...base, mode: 'dry' }).action).toBe('dry-revert');
    expect(decideEject({ ...base, mode: 'off' }).action).toBe('skip');
  });
  it('never reverts a revert', () => {
    expect(
      decideEject({
        ...base,
        culprit: { ...culprit, subject: 'revert(main-red): x (#1)' },
      }).reason
    ).toBe('culprit-is-a-revert');
    expect(
      decideEject({ ...base, culpritLabels: ['main-red-revert'] }).action
    ).toBe('alert');
    expect(isRevertSubject('Revert "feat: x"')).toBe(true);
    expect(isRevertSubject('feat: reverts nothing')).toBe(false);
  });
  it('allows one revert in flight per check', () => {
    expect(
      decideEject({ ...base, openReverts: [{ number: 9, check: 'test:a' }] })
        .reason
    ).toBe('revert-in-flight-for-check');
    expect(
      decideEject({ ...base, openReverts: [{ number: 9, check: 'test:b' }] })
        .action
    ).toBe('revert');
  });
  it('caps attempts per change and gives a live repair its grace', () => {
    expect(decideEject({ ...base, priorAttempts: 2 }).reason).toBe(
      'attempt-cap'
    );
    const repair = {
      number: 23712,
      createdAt: '2026-10-29T19:50:00Z',
      queued: false,
    };
    expect(decideEject({ ...base, repairs: [repair] }).reason).toBe(
      'repair-in-flight:#23712'
    );
    expect(
      decideEject({
        ...base,
        repairs: [{ ...repair, createdAt: '2026-10-29T18:00:00Z' }],
      }).action
    ).toBe('revert');
  });
  it('builds conventional titles within 100 chars', () => {
    const t = titles({
      pr: 23600,
      subject: `feat(marketing): ${'long '.repeat(40)} (#23600)`,
    });
    expect(t.revert.length).toBeLessThanOrEqual(100);
    expect(t.reopen.length).toBeLessThanOrEqual(100);
    expect(isRevertSubject(t.revert)).toBe(true);
    expect(parsePrNumber('feat: x (#23600)')).toBe(23600);
  });
});

describe('queue pitfalls', () => {
  const q = [
    { number: 5, position: 1, state: 'AWAITING_CHECKS' },
    { number: 7, position: 2, state: 'QUEUED', compounding: false },
  ];
  it('dequeues a queued PR before jumping (jump on a queued PR is a no-op)', () => {
    expect(planJump(q, 7)).toEqual({
      step: 'dequeue-then-enqueue-with-jump',
      staleAt: 2,
    });
    expect(planJump(q, 5).step).toBe('already-head');
    expect(planJump(q, 99).step).toBe('enqueue-with-jump');
  });
  it('trusts only a fresh read, flagging the stale reported position', () => {
    const fresh = [
      { number: 7, position: 1, compounding: true },
      { number: 5, position: 2 },
    ];
    expect(verifyJump(fresh, 7, 4)).toMatchObject({
      jumped: true,
      position: 1,
      reportedStale: true,
    });
    expect(verifyJump(fresh, 8)).toMatchObject({ queued: false });
  });
  it('dequeues an UNMERGEABLE head only after the 5 minute dwell', () => {
    const entries = [{ number: 23692, position: 1, state: 'UNMERGEABLE' }];
    const t0 = Date.parse('2026-10-29T18:33:00Z');
    expect(detectStuckHead(entries, {}, t0)).toMatchObject({
      stuck: false,
      observe: 23692,
    });
    const seen = { 23692: '2026-10-29T18:33:00Z' };
    expect(detectStuckHead(entries, seen, t0 + 4 * 60_000).stuck).toBe(false);
    expect(detectStuckHead(entries, seen, t0 + 6 * 60_000).stuck).toBe(true);
    expect(
      detectStuckHead(
        [{ number: 1, position: 1, state: 'AWAITING_CHECKS' }],
        seen,
        t0 + 9e6
      ).stuck
    ).toBe(false);
  });
});

describe('ambiguity', () => {
  it('alerts instead of reverting a culprit with an unproven predecessor', () => {
    const d = decideEject({
      culprit: { sha: 'c', pr: 1, subject: 'feat: x (#1)' },
      check: 'k',
      ambiguous: true,
    });
    expect(d).toEqual({
      action: 'alert',
      reason: 'ambiguous-culprit-needs-bisect',
    });
  });
});

describe('apply idle plans', () => {
  it('preserves an explicit dry-revert decision without mutations', async () => {
    const plan = {
      decision: { action: 'dry-revert', reason: 'culprit-attributed' },
    };
    await expect(apply(plan)).resolves.toEqual({ ...plan, applied: false });
  });
  it.each([
    'fewer-than-2-consecutive-failed-groups',
    'failures-do-not-share-a-signature',
  ])('keeps %s as a no-op without GitHub mutations', async reason => {
    const plan = { action: 'none', reason, trigger: null };
    await expect(apply(plan)).resolves.toEqual({ ...plan, applied: false });
  });
});

import {
  HEAD_STUCK_ALERT_MIN,
  headDwell,
  shouldFailOver,
} from '../main-red-eject.mjs';

describe('app-installation rate-limit guard (2026-10-31 5 h queue stall)', () => {
  it('fails over to GITHUB_TOKEN only when a fallback exists and the app is exhausted', () => {
    const limited = {
      code: 1,
      stderr: 'gh: API rate limit already exceeded for installation ID 1',
    };
    expect(shouldFailOver(limited, 'tok')).toBe(true);
    expect(shouldFailOver({ code: 75, deferred: true }, 'tok')).toBe(true);
    expect(shouldFailOver(limited, undefined)).toBe(false);
    expect(shouldFailOver({ code: 1, stderr: 'HTTP 404' }, 'tok')).toBe(false);
    expect(shouldFailOver({ code: 0 }, 'tok')).toBe(false);
  });

  it('measures how long the queue head has been waiting', () => {
    const now = Date.parse('2026-10-31T14:00:00Z');
    const m = headDwell(
      [
        {
          number: 7,
          position: 1,
          state: 'AWAITING_CHECKS',
          enqueuedAt: '2026-10-31T09:00:00Z',
        },
      ],
      now
    );
    expect(m).toMatchObject({ head: 7, stuckMin: 300 });
    expect(m.stuckMin).toBeGreaterThan(HEAD_STUCK_ALERT_MIN);
    expect(headDwell([], now).head).toBeNull();
  });

  it('keeps the workflow wired: failover token, write scopes, and a failure alert', () => {
    const wf = readFileSync(
      new URL('../../../.github/workflows/main-red-eject.yml', import.meta.url),
      'utf8'
    );
    expect(wf).toContain('GH_FALLBACK_TOKEN: ${{ github.token }}');
    expect(wf).toMatch(/pull-requests: write/);
    expect(wf).toMatch(/if: \$\{\{ failure\(\) \}\}[\s\S]*alert-failure/);
  });
});

describe('workflow dispatch inputs', () => {
  const root = resolve(here, '../../..');
  const dispatches = caller =>
    [...caller.matchAll(/'run',\s*'([\w./-]+\.yml)'([\s\S]*?)\]/g)].map(m => ({
      workflow: m[1],
      inputs: [...m[2].matchAll(/`([\w-]+)=/g)].map(x => x[1]),
    }));

  it('passes only inputs the target workflow declares (run 41122896980: pr_numbers 422)', () => {
    const caller = readFileSync(
      resolve(root, 'scripts/main-red-eject.mjs'),
      'utf8'
    );
    const found = dispatches(caller);
    expect(found.map(f => f.workflow)).toEqual(
      expect.arrayContaining([
        'pr-remediation-swarm.yml',
        'merge-queue-green-enroll.yml',
      ])
    );
    for (const { workflow, inputs } of found) {
      const yml = readFileSync(
        resolve(root, '.github/workflows', workflow),
        'utf8'
      );
      const start = yml.indexOf('workflow_dispatch:');
      const block = yml.slice(
        start,
        start + yml.slice(start).search(/\n  [^\s#]/)
      );
      const declared = [...block.matchAll(/^ {6}([\w-]+):/gm)].map(m => m[1]);
      expect(declared).toEqual(expect.arrayContaining(inputs));
    }
  });
});
