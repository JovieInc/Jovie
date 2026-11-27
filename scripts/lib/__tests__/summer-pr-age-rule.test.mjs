import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'vitest';

import {
  applyAgeRule,
  closeComment,
  LAST_TRY_LABEL,
  moveIssueToBacklog,
  planAgeRule,
  producerOf,
  REPAIR_LABEL,
  readPolicy,
} from '../../summer/pr-age-rule.mjs';

const NOW = Date.parse('2026-11-22T12:00:00Z');
const daysAgo = d => new Date(NOW - d * 86_400_000).toISOString();
const policy = {
  exemptProducers: ['tim', 'dependabot', 'revert', 'gh-readonly-queue'],
  ageRule: {
    enabled: true,
    lastTryDays: 7,
    closeDays: 10,
    maxTriesPerRun: 5,
    maxClosesPerRun: 15,
  },
};
const pr = (number, age, extra = {}) => ({
  number,
  createdAt: daysAgo(age),
  headRefName: `codex/jov-${number}-x`,
  labels: [],
  autoMerge: false,
  body: '',
  ...extra,
});

describe('old-PR rule plan', () => {
  it('tries at 7 days, closes at 10, and leaves younger PRs alone', () => {
    const plan = planAgeRule([pr(1, 3), pr(2, 8), pr(3, 12), pr(4, 9.9)], {
      nowMs: NOW,
      policy,
    });
    assert.deepEqual(
      plan.tries.map(p => p.number),
      [4, 2]
    );
    assert.deepEqual(
      plan.closes.map(p => p.number),
      [3]
    );
  });

  it('gives each PR its last try once', () => {
    const plan = planAgeRule([pr(2, 8, { labels: [LAST_TRY_LABEL] })], {
      nowMs: NOW,
      policy,
    });
    assert.equal(plan.tries.length, 0);
  });

  it('skips Tim, bots, human holds and PRs already merging', () => {
    const plan = planAgeRule(
      [
        pr(1, 20, { headRefName: 'tim/hand-work' }),
        pr(2, 20, { headRefName: 'dependabot/npm/x' }),
        pr(3, 20, { labels: ['hold'] }),
        pr(4, 20, { autoMerge: true }),
        pr(5, 20, { headRefName: 'no-slash-branch' }),
        pr(6, 20, { headRefName: 'glm/sidebar' }),
      ],
      { nowMs: NOW, policy }
    );
    assert.deepEqual(
      plan.closes.map(p => p.number),
      [6]
    );
  });

  it('does nothing while the rule is off', () => {
    const off = { ...policy, ageRule: { ...policy.ageRule, enabled: false } };
    const plan = planAgeRule([pr(3, 12)], { nowMs: NOW, policy: off });
    assert.equal(plan.disabled, true);
    assert.equal(plan.closes.length, 0);
  });

  it('caps closes per run, oldest first', () => {
    const capped = {
      ...policy,
      ageRule: { ...policy.ageRule, maxClosesPerRun: 2 },
    };
    const plan = planAgeRule([pr(1, 11), pr(2, 30), pr(3, 15)], {
      nowMs: NOW,
      policy: capped,
    });
    assert.deepEqual(
      plan.closes.map(p => p.number),
      [2, 3]
    );
  });

  it('reads the producer the way pr_wip.py does', () => {
    assert.equal(producerOf('GLM/x'), 'glm');
    assert.equal(producerOf('main'), '(none)');
    const python = readFileSync(
      new URL('../../lanes/pr_wip.py', import.meta.url),
      'utf8'
    );
    assert.match(
      python,
      /return branch\.split\("\/", 1\)\[0\]\.lower\(\) if "\/" in branch else "\(none\)"/
    );
  });

  it('is on in the shipped policy at 7 and 10 days', () => {
    const shipped = readPolicy().ageRule;
    assert.equal(shipped.enabled, true);
    assert.equal(shipped.lastTryDays, 7);
    assert.equal(shipped.closeDays, 10);
  });
});

function fakeLinear(state = 'started', { updateOk = true } = {}) {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const data = body.query.includes('AgeRuleIssue')
      ? {
          issue: {
            id: 'iss-1',
            state: { type: state },
            team: {
              states: {
                nodes: [{ id: 'st-b', name: 'Backlog', type: 'backlog' }],
              },
            },
          },
        }
      : { issueUpdate: { success: updateOk } };
    return new Response(JSON.stringify({ data }), { status: 200 });
  };
  return { calls, fetchImpl };
}

describe('Linear back to Backlog', () => {
  it('moves an open issue to Backlog', async () => {
    const { calls, fetchImpl } = fakeLinear('started');
    const out = await moveIssueToBacklog({
      identifier: 'JOV-1',
      apiKey: 'k',
      fetchImpl,
    });
    assert.equal(out.action, 'moved-to-backlog');
    assert.equal(calls[1].variables.stateId, 'st-b');
  });

  it('leaves a done issue alone', async () => {
    const { calls, fetchImpl } = fakeLinear('completed');
    const out = await moveIssueToBacklog({
      identifier: 'JOV-1',
      apiKey: 'k',
      fetchImpl,
    });
    assert.deepEqual(out, { ok: true, action: 'left-completed' });
    assert.equal(calls.length, 1);
  });

  it('needs no Linear call when no issue is linked', async () => {
    assert.deepEqual(await moveIssueToBacklog({ identifier: '' }), {
      ok: true,
      action: 'no-issue',
    });
  });
});

describe('old-PR rule apply', () => {
  /** @param {(args: string[]) => boolean} [fail] */
  function fakeGh(fail = () => false) {
    const calls = [];
    const run = (_bin, args) => {
      calls.push(args);
      return { status: fail(args) ? 1 : 0, stdout: '', stderr: '' };
    };
    return { calls, run };
  }

  it('labels, merges main and comments on a last try; closes with a Linear note', async () => {
    const { calls, run } = fakeGh();
    const { fetchImpl } = fakeLinear('started');
    const plan = {
      tries: [{ ...pr(2, 8), ageDays: 8 }],
      closes: [{ ...pr(3, 12), ageDays: 12 }],
    };
    const out = await applyAgeRule(plan, {
      repo: 'o/r',
      rule: policy.ageRule,
      apiKey: 'k',
      run,
      fetchImpl,
    });
    assert.deepEqual(out.failed, []);
    assert.deepEqual(out.tried, [{ pr: 2, mainMerged: true }]);
    assert.equal(out.closed[0].linear, 'JOV-3');
    assert.deepEqual(calls[0].slice(0, 3), ['label', 'create', LAST_TRY_LABEL]);
    assert.ok(calls[0].includes('--force'));
    assert.ok(calls[1].includes(`${LAST_TRY_LABEL},${REPAIR_LABEL}`));
    assert.ok(calls.some(a => a.includes('repos/o/r/pulls/2/update-branch')));
    const close = calls.find(a => a[1] === 'close');
    assert.match(close.at(-1), /Linear issue JOV-3 is back in Backlog/);
  });

  it('creates no label when there is nothing to try', async () => {
    const { calls, run } = fakeGh();
    await applyAgeRule(
      { tries: [], closes: [] },
      { repo: 'o/r', rule: policy.ageRule, run }
    );
    assert.deepEqual(calls, []);
  });

  it('records why a label step failed', async () => {
    const run = (/** @type {string} */ _bin, /** @type {string[]} */ args) =>
      args[1] === 'edit'
        ? {
            status: 1,
            stdout: '',
            stderr: "could not add label: 'x' not found\n",
          }
        : { status: 0, stdout: '', stderr: '' };
    const out = await applyAgeRule(
      { tries: [{ ...pr(2, 8), ageDays: 8 }], closes: [] },
      { repo: 'o/r', rule: policy.ageRule, run }
    );
    assert.deepEqual(out.failed, [
      { pr: 2, step: 'label', error: "could not add label: 'x' not found" },
    ]);
  });

  it('reports a failed close so the run asks for a repair', async () => {
    const { run } = fakeGh(args => args[1] === 'close');
    const plan = {
      tries: [],
      closes: [{ ...pr(3, 12), headRefName: 'glm/x', ageDays: 12 }],
    };
    const out = await applyAgeRule(plan, {
      repo: 'o/r',
      rule: policy.ageRule,
      run,
    });
    assert.deepEqual(out.failed, [{ pr: 3, step: 'close' }]);
  });

  it('says the branch is kept when closing', () => {
    const text = closeComment(
      { ...pr(3, 12), ageDays: 12 },
      policy.ageRule,
      'note'
    );
    assert.match(text, /branch `codex\/jov-3-x` is kept/);
  });
});
