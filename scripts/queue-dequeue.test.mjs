import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { readHistory, run, validate } from './queue-dequeue.mjs';

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

const VALID_ARGS = [
  '--pr',
  '5',
  '--reason',
  'owned fixture proves a real refusal',
];
const noWriteCalls = calls =>
  calls.every(
    args =>
      args[0] !== 'pr' &&
      !args.some(value => String(value).includes('dequeuePullRequest'))
  );

test('malformed history never clears limits or permits a native write', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qd-invalid-'));
  try {
    const logPath = join(dir, 'history.jsonl');
    assert.deepEqual(readHistory(logPath), []);
    const bad = [
      '{broken',
      'null',
      JSON.stringify({ at: 'invalid-time', pr: 5, actor: 'agent' }),
      JSON.stringify({
        at: new Date(NOW).toISOString(),
        pr: '5',
        actor: 'agent',
      }),
      JSON.stringify({ at: new Date(NOW).toISOString(), pr: 5, actor: '' }),
    ];
    for (const contents of bad) {
      writeFileSync(logPath, contents);
      const { gh, calls } = fake();
      assert.throws(
        () => run(VALID_ARGS, { gh, now: () => NOW, logPath, out: () => {} }),
        /history/
      );
      assert.ok(noWriteCalls(calls));
      assert.equal(readFileSync(logPath, 'utf8'), contents);
      assert.ok(!existsSync(`${logPath}.lock`));
    }
    const directory = join(dir, 'unreadable-as-file');
    mkdirSync(directory);
    assert.throws(() => readHistory(directory), /history is unreadable/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an existing local exclusion refuses without touching it or calling GitHub', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qd-held-'));
  try {
    const logPath = join(dir, 'history.jsonl');
    writeFileSync(`${logPath}.lock`, 'retained ownership proof');
    const { gh, calls } = fake();
    assert.throws(
      () => run(VALID_ARGS, { gh, now: () => NOW, logPath, out: () => {} }),
      /history is locked/
    );
    assert.deepEqual(calls, []);
    assert.equal(
      readFileSync(`${logPath}.lock`, 'utf8'),
      'retained ownership proof'
    );
    assert.ok(!existsSync(logPath));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the exclusion spans read, audit append, comment and mutation for cooperating callers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qd-concurrent-'));
  try {
    const logPath = join(dir, 'history.jsonl');
    const outer = fake();
    const inner = fake();
    let nestedRefused = false;
    let sawComment = false;
    const gh = args => {
      assert.ok(existsSync(`${logPath}.lock`));
      if (args[0] === 'api' && args[1] === 'user') {
        assert.throws(
          () =>
            run(VALID_ARGS, {
              gh: inner.gh,
              now: () => NOW,
              logPath,
              out: () => {},
            }),
          /history is locked/
        );
        nestedRefused = true;
      }
      if (args[0] === 'pr') {
        assert.equal(readHistory(logPath).length, 1);
        sawComment = true;
      }
      if (args.some(value => String(value).includes('dequeuePullRequest')))
        assert.ok(sawComment);
      return outer.gh(args);
    };
    assert.equal(
      run(VALID_ARGS, { gh, now: () => NOW, logPath, out: () => {} }),
      0
    );
    assert.ok(nestedRefused);
    assert.deepEqual(inner.calls, []);
    assert.equal(readHistory(logPath).length, 1);
    assert.equal(statSync(logPath).mode & 0o777, 0o600);
    assert.ok(!existsSync(`${logPath}.lock`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a failed comment retains the charged attempt and releases only its exclusion', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qd-comment-error-'));
  try {
    const logPath = join(dir, 'history.jsonl');
    const fixture = fake();
    let mutations = 0;
    const gh = args => {
      if (args[0] === 'pr') throw new Error('fixture comment rejected');
      if (args.some(value => String(value).includes('dequeuePullRequest')))
        mutations += 1;
      return fixture.gh(args);
    };
    assert.throws(
      () => run(VALID_ARGS, { gh, now: () => NOW, logPath, out: () => {} }),
      /fixture comment rejected/
    );
    assert.equal(mutations, 0);
    assert.equal(readHistory(logPath).length, 1);
    assert.ok(!existsSync(`${logPath}.lock`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('dry-run planning creates no ledger directory or exclusion', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qd-dry-no-state-'));
  try {
    const parent = join(dir, 'not-created');
    const { gh, calls } = fake();
    assert.equal(
      run([...VALID_ARGS, '--dry-run'], {
        gh,
        now: () => NOW,
        logPath: join(parent, 'history.jsonl'),
        out: () => {},
      }),
      0
    );
    assert.ok(!existsSync(parent));
    assert.ok(noWriteCalls(calls));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a missing authenticated actor cannot produce an audited dequeue', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qd-no-actor-'));
  try {
    const logPath = join(dir, 'history.jsonl');
    const { gh, calls } = fake({ actor: '' });
    const messages = [];
    assert.equal(
      run(VALID_ARGS, {
        gh,
        now: () => NOW,
        logPath,
        out: message => messages.push(message),
      }),
      1
    );
    assert.match(messages[0], /authenticated actor unavailable/);
    assert.ok(noWriteCalls(calls));
    assert.ok(!existsSync(logPath));
    assert.ok(!existsSync(`${logPath}.lock`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the standalone command uses the budgeted client from any cwd and propagates quota deferral', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qd-client-'));
  try {
    const scripts = join(dir, 'scripts');
    const client = join(dir, 'packages', 'api-client');
    const bin = join(dir, 'bin');
    for (const path of [scripts, client, bin])
      mkdirSync(path, { recursive: true });
    const command = join(scripts, 'queue-dequeue.mjs');
    writeFileSync(
      command,
      readFileSync(new URL('./queue-dequeue.mjs', import.meta.url))
    );
    writeFileSync(join(bin, 'gh'), '#!/bin/sh\nexit 97\n', { mode: 0o700 });
    writeFileSync(
      join(client, 'cli.ts'),
      `
      const args = process.argv.slice(2);
      if (args.slice(0, 4).join(' ') !== 'gh --priority repair --') process.exit(98);
      if (process.env.FIXTURE_QUOTA === '1') process.exit(75);
      const call = args.slice(4);
      if (call.join(' ') === 'api user') console.log(JSON.stringify({login:'fixture'}));
      else if (call[0] === 'api' && call.includes('graphql') && call.some(a => a.includes('mergeQueueEntry')))
        console.log(JSON.stringify({data:{repository:{pullRequest:{id:'PR_fixture',mergeQueueEntry:{state:'AWAITING_CHECKS',position:2}}}}}));
      else process.exit(99);
    `
    );
    const logPath = join(dir, 'state', 'history.jsonl');
    for (const quota of ['0', '1']) {
      const result = spawnSync(
        process.execPath,
        [
          command,
          '--pr',
          '5',
          '--reason',
          'fixture verifies client routing',
          '--dry-run',
        ],
        {
          cwd: dir,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: bin,
            JOVIE_QUEUE_LOG: logPath,
            FIXTURE_QUOTA: quota,
          },
        }
      );
      assert.equal(result.status, quota === '1' ? 75 : 0, result.stderr);
      if (quota === '0') assert.match(result.stdout, /DRY RUN.*fixture/);
      assert.equal(existsSync(dirname(logPath)), false);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
