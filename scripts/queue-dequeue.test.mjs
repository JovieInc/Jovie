import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { run, validate } from './queue-dequeue.mjs';

const NOW = Date.parse('2026-10-26T07:00:00Z');
function fake({ inQueue = true, actor = 'agent' } = {}) {
  const calls = [];
  const gh = args => {
    calls.push(args);
    if (args[0] === 'api' && args[1] === 'user')
      return JSON.stringify({ login: actor });
    if (
      args.includes('graphql') &&
      args.some(a => String(a).includes('mergeQueueEntry'))
    )
      return JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              id: 'PR_1',
              mergeQueueEntry: inQueue
                ? { state: 'AWAITING_CHECKS', position: 2 }
                : null,
            },
          },
        },
      });
    return '';
  };
  return { gh, calls };
}

test('a dequeue needs a real reason, is logged, commented and then performed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qd-'));
  try {
    const logPath = join(dir, 'd.jsonl');
    const { gh, calls } = fake();
    const out = [];
    assert.equal(
      run(['--pr', '5', '--reason', 'x'], {
        gh,
        now: () => NOW,
        logPath,
        out: l => out.push(l),
      }),
      1
    );
    assert.match(out[0], /REFUSED.*at least 15/);
    assert.ok(
      !calls.some(c => JSON.stringify(c).includes('dequeuePullRequest'))
    );
    out.length = 0;
    assert.equal(
      run(
        [
          '--pr',
          '5',
          '--reason',
          'poisons groups: nav-label-unbound',
          '--code',
          'poison',
        ],
        { gh, now: () => NOW, logPath, out: l => out.push(l) }
      ),
      0
    );
    const row = JSON.parse(readFileSync(logPath, 'utf8').trim());
    assert.deepEqual(
      [row.pr, row.actor, row.code, row.position],
      [5, 'agent', 'poison', 2]
    );
    assert.ok(
      calls.some(
        c =>
          c[0] === 'pr' &&
          c[1] === 'comment' &&
          c.join(' ').includes('poisons groups')
      )
    );
    assert.ok(
      calls.some(c => JSON.stringify(c).includes('dequeuePullRequest'))
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('refuses a PR that is not queued, repeated reorder dequeues, and an actor over its hourly cap', () => {
  const args = { pr: 9, reason: 'a perfectly good reason' };
  const row = (pr, actor, minutesAgo) => ({
    pr,
    actor,
    at: new Date(NOW - minutesAgo * 60_000).toISOString(),
  });
  assert.match(
    validate(args, { inQueue: false, actor: 'a' }, [], NOW).join(),
    /not in the merge queue/
  );
  assert.match(
    validate(
      args,
      { inQueue: true, actor: 'a' },
      [row(9, 'a', 5), row(9, 'b', 20)],
      NOW
    ).join(),
    /fix the cause instead of reordering/
  );
  assert.equal(
    validate(args, { inQueue: true, actor: 'a' }, [row(9, 'a', 90)], NOW)
      .length,
    0
  );
  const many = Array.from({ length: 6 }, (_, i) => row(100 + i, 'a', 3));
  assert.match(
    validate(args, { inQueue: true, actor: 'a' }, many, NOW).join(),
    /already made 6 dequeues/
  );
  assert.equal(
    validate(args, { inQueue: true, actor: 'b' }, many, NOW).length,
    0
  );
});

test('dry run changes nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qd-'));
  try {
    const { gh, calls } = fake();
    const out = [];
    assert.equal(
      run(['--pr', '5', '--reason', 'long enough reason here', '--dry-run'], {
        gh,
        now: () => NOW,
        logPath: join(dir, 'd.jsonl'),
        out: l => out.push(l),
      }),
      0
    );
    assert.match(out[0], /DRY RUN/);
    assert.ok(
      !calls.some(
        c => c[0] === 'pr' || JSON.stringify(c).includes('dequeuePullRequest')
      )
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
