import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { test } from 'node:test';

import { openNativeBacklogGuard } from '../native-backlog-guard.mjs';

const ISSUE_ID = '68b3e8de-588e-46ba-8209-84329d154627';
const VERSION = '2026-10-16T20:00:00.000Z';
const NONCE = 'a'.repeat(64);
const delivery = () => ({
  identifier: 'JOV-6641',
  issueId: ISSUE_ID,
  expectedState: 'Backlog',
  expectedLinearUpdatedAt: VERSION,
});
const observation = (allowed = true) => ({
  schema: 'jovie.backlog-admission-observation/v1',
  issue: 'JOV-6641',
  allowed,
  authorizesTransition: false,
  authorizesDispatch: false,
  holds: allowed
    ? []
    : [
        {
          code: 'native-custody-held',
          owner: 'incumbent',
          evidence: { current: true },
          nextAction: 'Preserve accepted custody.',
        },
      ],
  evidence: { observedAt: Date.now() / 1000, readOnly: true },
});
const frame = (phase, details = {}) => ({
  schema: 'jovie.backlog-writer-guard/v1',
  issue: 'JOV-6641',
  expectedVersion: VERSION,
  nonce: NONCE,
  authorizesTransition: false,
  authorizesDispatch: false,
  phase,
  ...(['prepared', 'locked'].includes(phase)
    ? { issueId: ISSUE_ID, priority: 1, observation: observation() }
    : {}),
  ...details,
});

function fakeProcess({
  prepare = frame('prepared'),
  onControl,
  endCloses = true,
} = {}) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.controls = [];
  child.kills = [];
  child.send = value => child.stdout.write(`${JSON.stringify(value)}\n`);
  child.exit = (code = 0) => {
    child.stdout.end();
    child.emit('close', code, null);
  };
  child.stdin = new Writable({
    write(chunk, _encoding, done) {
      const control = JSON.parse(chunk.toString());
      child.controls.push(control);
      if (onControl) onControl(control, child);
      else if (control.op === 'lock' || control.op === 'check')
        child.send(
          frame('locked', {
            expiresAt: (child.expiresAt ??= Date.now() / 1000 + 25),
            lockIdentity: { device: 1, inode: 123 },
          })
        );
      else {
        child.send(frame('released', { result: control.op }));
        child.exit();
      }
      done();
    },
  });
  child.stdin.on('finish', () => {
    if (endCloses) child.exit();
  });
  child.kill = signal => {
    child.kills.push(signal);
    child.exit(null);
    return true;
  };
  let calls = 0;
  child.spawn = () => {
    calls++;
    queueMicrotask(() => {
      if (prepare !== null) child.send(prepare);
    });
    return child;
  };
  child.calls = () => calls;
  return child;
}

async function opened(t, options = {}, deps = {}) {
  const child = fakeProcess(options);
  const guard = await openNativeBacklogGuard(delivery(), {
    spawnImpl: child.spawn,
    ...deps,
  });
  t.after(() => guard.close());
  return { child, guard };
}

function unknownCode(code) {
  return error => error.code === code && error.effect === 'unknown';
}

test('real private child completes fragmented preparation, lock checks and verified release', async t => {
  const script = `
    import { createInterface } from 'node:readline';
    const prepared = ${JSON.stringify(frame('prepared'))};
    const emit = value => process.stdout.write(JSON.stringify(value) + '\\n');
    const raw = JSON.stringify(prepared) + '\\n';
    process.stderr.write('private-provider-diagnostic');
    process.stdout.write(raw.slice(0, 40));
    setImmediate(() => process.stdout.write(raw.slice(40)));
    let locked;
    createInterface({ input: process.stdin }).on('line', line => {
      const request = JSON.parse(line);
      if (Object.keys(request).sort().join() !== 'nonce,op' || request.nonce !== prepared.nonce) process.exit(3);
      if (request.op === 'lock') locked = { ...prepared, phase: 'locked', expiresAt: Date.now()/1000+25,
        lockIdentity: { device: 1, inode: 123 } };
      if (request.op === 'lock' || request.op === 'check') emit(locked);
      else process.stdout.write(JSON.stringify({ schema: prepared.schema, issue: prepared.issue,
        expectedVersion: prepared.expectedVersion, nonce: prepared.nonce, authorizesTransition: false,
        authorizesDispatch: false, phase: 'released', result: request.op }) + '\\n', () => process.exit(0));
    });
  `;
  let calls = 0;
  const guard = await openNativeBacklogGuard(delivery(), {
    spawnImpl(command, args, options) {
      calls++;
      assert.equal(command, 'python3');
      assert.deepEqual(args, [
        join(
          homedir(),
          '.local/state/jovie-lanes/current/backlog_writer_guard.py'
        ),
        '--issue',
        'JOV-6641',
        '--expected-version',
        VERSION,
      ]);
      assert.deepEqual(options, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      });
      return spawn(
        process.execPath,
        ['--input-type=module', '-e', script],
        options
      );
    },
  });
  t.after(() => guard.close());
  assert.equal(guard.issueId, ISSUE_ID);
  assert.equal(guard.priority, 1);
  assert.equal(guard.observation.allowed, true);
  assert.equal(guard.observation.authorizesTransition, false);
  assert.ok(Object.isFrozen(guard.observation.evidence));
  assert.throws(() => {
    guard.observation.allowed = false;
  }, TypeError);
  const lock = await guard.lock();
  assert.deepEqual((await guard.check()).lockIdentity, lock.lockIdentity);
  assert.equal((await guard.finish()).result, 'done');
  assert.equal(guard.signal.aborted, false);
  await guard.close();
  await guard.close();
  assert.equal(calls, 1);
});

test('real child EOF, wrong nonce, priority drift and coalesced output fail closed', async () => {
  for (const mode of ['eof', 'nonce', 'priority', 'coalesced', 'death']) {
    const script = `
      import { createInterface } from 'node:readline';
      const prepared = ${JSON.stringify(frame('prepared'))};
      const mode = ${JSON.stringify(mode)};
      if (mode === 'eof') process.stdout.write('{"phase":', () => process.exit(0));
      else if (mode === 'death') process.exit(2);
      else if (mode === 'coalesced') process.stdout.write(
        JSON.stringify(prepared)+'\\n'+JSON.stringify(prepared)+'\\n');
      else {
        process.stdout.write(JSON.stringify(prepared)+'\\n');
        createInterface({input:process.stdin}).on('line', () => process.stdout.write(JSON.stringify({
          ...prepared, phase:'locked', nonce:mode==='nonce'?'b'.repeat(64):prepared.nonce,
          priority:mode==='priority'?2:1, expiresAt:Date.now()/1000+25,
          lockIdentity:{device:1,inode:123}
        })+'\\n'));
      }
    `;
    let calls = 0;
    let guard;
    await assert.rejects(
      async () => {
        guard = await openNativeBacklogGuard(delivery(), {
          spawnImpl(_command, _args, options) {
            calls++;
            return spawn(
              process.execPath,
              ['--input-type=module', '-e', script],
              options
            );
          },
        });
        await guard.lock();
      },
      error => error.effect === 'unknown'
    );
    await guard?.close();
    assert.equal(calls, 1);
  }
});

test('abort is a verified release, while illegal phase and result fail closed', async t => {
  const first = await opened(t);
  await first.guard.lock();
  assert.equal((await first.guard.finish('abort')).result, 'abort');
  assert.deepEqual(
    first.child.controls.map(value => value.op),
    ['lock', 'abort']
  );
  const second = await opened(t);
  await assert.rejects(
    second.guard.check(),
    unknownCode('native-backlog-guard-phase-invalid')
  );
  assert.equal(second.guard.signal.aborted, true);
  const third = await opened(t);
  await third.guard.lock();
  await assert.rejects(
    third.guard.finish('write'),
    unknownCode('native-backlog-guard-phase-invalid')
  );
});

test('invalid bindings never spawn or accept executable path and environment overrides', async () => {
  for (const change of [
    { identifier: 'LYB-1' },
    { identifier: 'JOV-0' },
    { issueId: 'bad' },
    { expectedState: 'Todo' },
    { expectedLinearUpdatedAt: 'today' },
    { expectedLinearUpdatedAt: null },
  ]) {
    let calls = 0;
    await assert.rejects(
      openNativeBacklogGuard(
        { ...delivery(), ...change },
        {
          spawnImpl() {
            calls++;
          },
          guardPath: '/tmp/untrusted',
          env: { AUTH: 'untrusted' },
        }
      ),
      unknownCode('native-backlog-guard-binding-invalid')
    );
    assert.equal(calls, 0);
  }
  await assert.rejects(
    openNativeBacklogGuard(delivery(), {
      spawnImpl() {
        throw Error('private');
      },
    }),
    error =>
      unknownCode('native-backlog-guard-spawn-failed')(error) &&
      !error.message.includes('private')
  );
});

test('strict bound preparation rejects malformed priority, authority, identity and observation', async () => {
  const variants = [
    { schema: 'other' },
    { issue: 'JOV-6642' },
    { expectedVersion: '2026-10-16T20:01:00.000Z' },
    { nonce: 'g'.repeat(64) },
    { issueId: '68b3e8de-588e-46ba-8209-84329d154628' },
    ...[null, '1', -1, 5, 1.5].map(priority => ({ priority })),
    { authorizesTransition: true },
    { authorizesDispatch: true },
    { extra: 'unbound' },
    { observation: observation(false) },
    { observation: { ...observation(), authorizesDispatch: true } },
    { observation: { ...observation(), evidence: null } },
    { observation: { ...observation(), holds: [{}] } },
  ];
  for (const variant of variants) {
    const child = fakeProcess({ prepare: frame('prepared', variant) });
    await assert.rejects(
      openNativeBacklogGuard(delivery(), { spawnImpl: child.spawn }),
      unknownCode('native-backlog-guard-protocol-invalid')
    );
    assert.equal(child.calls(), 1);
    assert.equal(child.controls.length, 0);
  }
});

test('named held custody is negative evidence and never a lock grant', async () => {
  const child = fakeProcess({
    prepare: frame('held', {
      observation: observation(false),
      reason: 'canonical-claim-lock-busy',
      effect: 'unknown-if-parent-write-started',
    }),
  });
  await assert.rejects(
    openNativeBacklogGuard(delivery(), { spawnImpl: child.spawn }),
    error => {
      assert.equal(error.observation.holds[0].owner, 'incumbent');
      assert.equal(error.reason, 'canonical-claim-lock-busy');
      return unknownCode('native-backlog-guard-held')(error);
    }
  );
  for (const variant of [
    {},
    { observation: observation() },
    { reason: 'private error text' },
    { reason: 'held', effect: 'authorizes-write' },
  ]) {
    const other = fakeProcess({ prepare: frame('held', variant) });
    await assert.rejects(
      openNativeBacklogGuard(delivery(), { spawnImpl: other.spawn }),
      unknownCode('native-backlog-guard-protocol-invalid')
    );
  }
});

test('revalidation drift, wrong nonce and changed canonical inode/expiry are fatal', async t => {
  for (const variant of [
    { priority: 2 },
    { nonce: 'b'.repeat(64) },
    { expiresAt: Number.NaN },
    { expiresAt: Date.now() / 1000 + 40 },
    { expiresAt: Date.now() / 1000 + 1 },
    { lockIdentity: { device: 1, inode: 0 } },
    { lockIdentity: { device: 1, inode: 123, path: '/tmp/other' } },
  ]) {
    const { child, guard } = await opened(t, {
      onControl(_request, process) {
        process.send(
          frame('locked', {
            expiresAt: Date.now() / 1000 + 25,
            lockIdentity: { device: 1, inode: 123 },
            ...variant,
          })
        );
      },
    });
    await assert.rejects(guard.lock(), error => error.effect === 'unknown');
    assert.equal(guard.signal.aborted, true);
    assert.equal(child.calls(), 1);
  }
  for (const variant of [
    { lockIdentity: { device: 2, inode: 123 } },
    { lockIdentity: { device: 1, inode: 124 } },
    { expiresAt: Date.now() / 1000 + 24 },
  ]) {
    let locked;
    const { guard } = await opened(t, {
      onControl(request, child) {
        locked ??= frame('locked', {
          expiresAt: Date.now() / 1000 + 25,
          lockIdentity: { device: 1, inode: 123 },
        });
        child.send(request.op === 'lock' ? locked : { ...locked, ...variant });
      },
    });
    await guard.lock();
    await assert.rejects(
      guard.check(),
      unknownCode('native-backlog-guard-lock-invalid')
    );
  }
});

test('revalidation hold aborts an in-flight consumer without interpreting transition authority', async t => {
  const { guard } = await opened(t, {
    onControl(_request, child) {
      child.send(frame('held', { observation: observation(false) }));
    },
  });
  await assert.rejects(guard.lock(), unknownCode('native-backlog-guard-held'));
  assert.equal(guard.signal.aborted, true);
  assert.equal(guard.signal.reason.observation.authorizesTransition, false);
});

test('fractional Python expiry rounds toward an earlier parent deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const clock = Date.now();
  const { guard } = await opened(
    t,
    {
      onControl(_request, child) {
        child.send(
          frame('locked', {
            expiresAt: (clock + 25_000.5) / 1000,
            lockIdentity: { device: 1, inode: 123 },
          })
        );
      },
    },
    { now: () => clock }
  );
  await guard.lock();
  t.mock.timers.tick(24_999);
  assert.equal(guard.signal.aborted, true);
  await assert.rejects(
    guard.check(),
    unknownCode('native-backlog-guard-expired')
  );
});

test('malformed, oversized, partial and unsolicited/coalesced data never produce a usable guard', async () => {
  for (const raw of [
    'not-json\n',
    'x'.repeat(1024 * 1024 + 1),
    `${JSON.stringify(frame('prepared'))}\n${JSON.stringify(frame('prepared'))}\n`,
  ]) {
    const child = fakeProcess({ prepare: null });
    const pending = openNativeBacklogGuard(delivery(), {
      spawnImpl: child.spawn,
    });
    child.stdout.write(raw);
    await assert.rejects(pending, error => error.effect === 'unknown');
    assert.equal(child.calls(), 1);
  }
  const partial = fakeProcess({ prepare: null });
  const pending = openNativeBacklogGuard(delivery(), {
    spawnImpl: partial.spawn,
  });
  partial.stdout.write('{"phase":');
  partial.exit(0);
  await assert.rejects(pending, error => error.effect === 'unknown');
});

test('child death, stream error and unverified release cannot become successful completion', async t => {
  for (const action of [
    child => child.exit(2),
    child => child.emit('error', Error('private')),
    child => child.stdout.emit('error', Error('private')),
    child => child.stdin.emit('error', Error('private')),
  ]) {
    const { child, guard } = await opened(t);
    action(child);
    await assert.rejects(
      guard.lock(),
      error => error.effect === 'unknown' && !error.message.includes('private')
    );
    assert.equal(guard.signal.aborted, true);
  }
  for (const mode of ['wrong-result', 'wrong-shape', 'nonzero']) {
    const { guard } = await opened(t, {
      onControl(request, child) {
        if (request.op === 'lock')
          child.send(
            frame('locked', {
              expiresAt: Date.now() / 1000 + 25,
              lockIdentity: { device: 1, inode: 123 },
            })
          );
        else {
          child.send(
            frame('released', {
              result: mode === 'wrong-result' ? 'abort' : 'done',
              ...(mode === 'wrong-shape' ? { authority: true } : {}),
            })
          );
          child.exit(mode === 'nonzero' ? 2 : 0);
        }
      },
    });
    await guard.lock();
    await assert.rejects(guard.finish(), error => error.effect === 'unknown');
  }
});

test('concurrent control, close, and repeated operations never retry or release by inference', async t => {
  const { child, guard } = await opened(t, { onControl() {} });
  const first = guard.lock();
  const rejected = assert.rejects(
    first,
    unknownCode('native-backlog-guard-concurrent-control')
  );
  await assert.rejects(
    guard.lock(),
    unknownCode('native-backlog-guard-concurrent-control')
  );
  await rejected;
  await guard.close();
  await guard.close();
  await assert.rejects(guard.finish(), error => error.effect === 'unknown');
  assert.equal(child.calls(), 1);
  assert.equal(child.controls.length, 1);
});

test('prepare and lock I/O have bounded deadlines with no retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const child = fakeProcess({ prepare: null });
  const pending = openNativeBacklogGuard(delivery(), {
    spawnImpl: child.spawn,
  });
  const rejected = assert.rejects(
    pending,
    unknownCode('native-backlog-guard-timeout')
  );
  t.mock.timers.tick(75_000);
  await rejected;
  assert.equal(child.calls(), 1);
  const { child: second, guard } = await opened(t, { onControl() {} });
  const locking = guard.lock();
  const held = assert.rejects(
    locking,
    unknownCode('native-backlog-guard-timeout')
  );
  t.mock.timers.tick(20_000);
  await held;
  assert.equal(second.controls.length, 1);
});

test('a release frame still requires bounded successful process exit', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { child, guard } = await opened(t, {
    onControl(request, process) {
      if (request.op === 'lock')
        process.send(
          frame('locked', {
            expiresAt: Date.now() / 1000 + 25,
            lockIdentity: { device: 1, inode: 123 },
          })
        );
      else process.send(frame('released', { result: request.op }));
    },
  });
  await guard.lock();
  const finishing = guard.finish();
  const rejected = assert.rejects(
    finishing,
    unknownCode('native-backlog-guard-release-unverified')
  );
  await Promise.resolve();
  t.mock.timers.tick(25_000);
  await rejected;
  assert.equal(guard.signal.aborted, true);
  assert.deepEqual(
    child.controls.map(control => control.op),
    ['lock', 'done']
  );
});

test('expiry aborts ongoing work, clock advance fails closed, and cleanup kills a stuck child', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { guard } = await opened(t);
  await guard.lock();
  t.mock.timers.tick(25_000);
  assert.equal(guard.signal.aborted, true);
  await assert.rejects(
    guard.check(),
    unknownCode('native-backlog-guard-expired')
  );
  let clock = Date.now();
  const other = await opened(
    t,
    {
      onControl(_request, child) {
        child.send(
          frame('locked', {
            expiresAt: clock / 1000 + 25,
            lockIdentity: { device: 1, inode: 123 },
          })
        );
      },
    },
    { now: () => clock }
  );
  await other.guard.lock();
  clock += 26_000;
  await assert.rejects(
    other.guard.check(),
    unknownCode('native-backlog-guard-expired')
  );
  const stuck = fakeProcess({ endCloses: false });
  const session = await openNativeBacklogGuard(delivery(), {
    spawnImpl: stuck.spawn,
  });
  const cleanup = session.close();
  t.mock.timers.tick(1000);
  await cleanup;
  assert.deepEqual(stuck.kills, ['SIGKILL']);
});
