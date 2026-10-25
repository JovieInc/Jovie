import { describe, expect, it } from 'vitest';
import {
  buildIssue,
  buildReceipt,
  evaluateRules,
  loopFingerprint,
  planLoopIntake,
  resolveComment,
} from '../loop-health.mjs';

const rules = [
  {
    id: 'bounce',
    metric: 'bounce',
    op: 'max',
    threshold: 2,
    unit: '%',
    sample: { metric: 'n', min: 100 },
  },
  { id: 'dns', metric: 'dns', op: 'max', threshold: 0 },
  { id: 'crash-free', metric: 'cf', op: 'min', threshold: 99 },
];
const def = {
  key: 'demo',
  title: 'Demo loop breach',
  owner: 'jovie-web',
  source: 'demo',
  summary: 'Demo summary.',
  whyItMatters: 'Because.',
  remeasure: 'node scripts/loop-health.mjs --loop demo --no-file',
  dwellSloMinutes: 60,
  rules,
};
const at = '2026-10-25T00:00:00.000Z';
const receiptFor = metrics => {
  const evaluation = evaluateRules(rules, metrics);
  return buildReceipt({
    loop: 'demo',
    startedAt: at,
    finishedAt: at,
    metrics,
    evaluation,
  });
};

describe('evaluateRules', () => {
  it('is ok only when every rule is judged and within threshold', () => {
    expect(
      evaluateRules(rules, { bounce: 1, n: 500, dns: 0, cf: 99.5 }).status
    ).toBe('ok');
  });

  it('breaches on max above and min below the threshold', () => {
    expect(
      evaluateRules(rules, { bounce: 3, n: 500, dns: 0, cf: 99.5 }).status
    ).toBe('breach');
    expect(
      evaluateRules(rules, { bounce: 1, n: 500, dns: 0, cf: 98 }).status
    ).toBe('breach');
  });

  it('treats a thin sample as insufficient, never as ok or breach', () => {
    const { status, results } = evaluateRules(rules, {
      bounce: 50,
      n: 3,
      dns: 0,
      cf: 100,
    });
    expect(results[0].state).toBe('insufficient');
    expect(status).toBe('hold');
  });

  it('treats a missing metric as unknown and holds', () => {
    const { status, results } = evaluateRules(rules, {
      n: 500,
      dns: 0,
      cf: 100,
    });
    expect(results[0].state).toBe('unknown');
    expect(status).toBe('hold');
  });

  it('still breaches when another rule is unjudged', () => {
    expect(evaluateRules(rules, { dns: 2, cf: 100 }).status).toBe('breach');
  });
});

describe('planLoopIntake', () => {
  it('upserts on breach, resolves on ok, holds otherwise', () => {
    expect(
      planLoopIntake(receiptFor({ bounce: 3, n: 500, dns: 0, cf: 100 })).action
    ).toBe('upsert');
    expect(
      planLoopIntake(receiptFor({ bounce: 1, n: 500, dns: 0, cf: 100 })).action
    ).toBe('resolve');
    expect(
      planLoopIntake(receiptFor({ bounce: 1, n: 5, dns: 0, cf: 100 })).action
    ).toBe('hold');
  });

  it('never resolves a collection error', () => {
    const receipt = buildReceipt({
      loop: 'demo',
      startedAt: at,
      finishedAt: at,
      metrics: {},
      evaluation: { status: 'hold', results: [] },
      collectError: 'boom',
    });
    expect(receipt.status).toBe('error');
    expect(planLoopIntake(receipt).action).toBe('hold');
  });
});

describe('issue text', () => {
  it('names the fingerprint, breach, closure rule and re-measure command', () => {
    const receipt = receiptFor({ bounce: 3.5, n: 500, dns: 0, cf: 100 });
    const issue = buildIssue(def, receipt, 'https://example/run/1');
    expect(issue.fingerprint).toBe(loopFingerprint('demo'));
    expect(issue.title).toContain('(loop-health-demo)');
    expect(issue.description).toContain('bounce: 3.5% (limit <= 2%)');
    expect(issue.description).toContain('closes automatically only when');
    expect(issue.description).toContain(
      'node scripts/loop-health.mjs --loop demo --no-file'
    );
    expect(issue.description).toContain('Dwell SLO: filed within 60 minutes');
    expect(issue.description).toContain(
      '## Acceptance criteria or triage question'
    );
  });

  it('records stage timestamps in the receipt', () => {
    const receipt = receiptFor({ bounce: 1, n: 500, dns: 0, cf: 100 });
    expect(receipt.schema).toBe('jovie-loop-health/v1');
    expect(receipt.startedAt).toBe(at);
    expect(receipt.durationMs).toBe(0);
    expect(resolveComment(def, receipt)).toContain('within threshold');
  });
});
