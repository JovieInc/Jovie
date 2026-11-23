import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CHAT_OUTCOME_KEYS,
  planChatOutcomeIntake,
  runChatOutcomeIntake,
} from './chat-outcome-intake.mjs';

const report = (findings, checks = [...CHAT_OUTCOME_KEYS]) => ({
  checkedAt: '2026-11-22T07:47:00Z',
  windowHours: 24,
  checks,
  findings,
  totals: { turns: 10, actionTurns: 4, stalled: findings.length },
});
const finding = key => ({ key, title: key, detail: 'd', evidence: {} });

describe('planChatOutcomeIntake', () => {
  it('files stalled intents and resolves the other judged intents', () => {
    const plan = planChatOutcomeIntake(report([finding('chat-stall-merch')]));
    assert.equal(plan.verdict, 'red');
    assert.deepEqual(
      plan.upserts.map(f => f.key),
      ['chat-stall-merch']
    );
    assert.deepEqual(plan.resolves, [
      'chat-stall-task',
      'chat-stall-release',
      'chat-stall-bio',
    ]);
  });

  it('never resolves an intent nobody asked for in the window', () => {
    const plan = planChatOutcomeIntake(report([], ['chat-stall-task']));
    assert.deepEqual(plan.resolves, ['chat-stall-task']);
  });

  it('rejects unknown keys', () => {
    assert.throws(() => planChatOutcomeIntake(report([finding('nope')])));
  });

  it('is unmeasured without a report', () => {
    assert.equal(planChatOutcomeIntake(null).verdict, 'unmeasured');
  });
});

describe('runChatOutcomeIntake', () => {
  it('throws on a missing report so nothing resolves', async () => {
    await assert.rejects(runChatOutcomeIntake({ env: {} }));
  });

  it('dry-runs when remediation triggers are disabled', async () => {
    const env = {
      CHAT_OUTCOME_JSON: JSON.stringify(report([finding('chat-stall-bio')])),
    };
    const previous = process.env.REMEDIATION_TRIGGERS_DISABLED;
    process.env.REMEDIATION_TRIGGERS_DISABLED = 'true';
    try {
      const { plan, summary } = await runChatOutcomeIntake({ env });
      assert.equal(plan.verdict, 'red');
      assert.match(summary, /red chat-stall-bio/);
    } finally {
      if (previous === undefined)
        delete process.env.REMEDIATION_TRIGGERS_DISABLED;
      else process.env.REMEDIATION_TRIGGERS_DISABLED = previous;
    }
  });
});
