import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { resolveLabelId } from '../../deprecation-intake.mjs';
import { scanSource } from '../../invariants/latency-sensitive-execution.mjs';
import { fileLinearIssue } from '../../qa-swarm/linear.mjs';
import {
  activeResetAt,
  credentialBackoff,
  credentialHash,
  fallbackCooldownRoot,
  LINEAR_API_URL,
  legacyKeyHash,
  linearRequest,
  publishLaneCooldown,
} from '../linear-cooldown.mjs';
import { upsertLinearIssueByTitleFingerprint } from '../linear-issue-intake.mjs';

const root = mkdtempSync(join(tmpdir(), 'linear-cooldown-'));
const previous = {
  dir: process.env.LINEAR_COOLDOWN_STATE_DIR,
  lanes: process.env.LANES_STATE,
  backoff: process.env.LINEAR_BACKOFF_STATE_DIR,
  key: process.env.LINEAR_API_KEY,
};
process.env.LINEAR_COOLDOWN_STATE_DIR = root;
delete process.env.LANES_STATE;
delete process.env.LINEAR_BACKOFF_STATE_DIR;
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
});

function deferredSignal() {
  let resolve = () => {};
  const promise = new Promise(done => {
    resolve = () => done(undefined);
  });
  return { promise, resolve };
}

describe('shared linear cooldown', () => {
  it('has no blocking filesystem calls in the shared request helper', () => {
    const file = new URL('../linear-cooldown.mjs', import.meta.url);
    const source = fs.readFileSync(file, 'utf8');
    assert.deepEqual(scanSource('scripts/lib/linear-cooldown.mjs', source), []);
  });

  it('hashes the key with the API URL and never writes the raw key', () => {
    const key = 'lin_api_test_secret';
    const hash = credentialHash(key);
    assert.equal(
      hash,
      createHash('sha256').update(`${LINEAR_API_URL}\0${key}`).digest('hex')
    );
    assert.equal(hash.includes(key), false);
    assert.notEqual(hash, legacyKeyHash(key));
  });

  it('429, 400 and HTTP 200 RATELIMITED publish one deadline and the next call skips the network', async () => {
    const key = 'shared-secret';
    const bodies = [
      { status: 429, data: {} },
      {
        status: 400,
        data: { errors: [{ extensions: { code: 'RATELIMITED' } }] },
      },
      {
        status: 200,
        data: {
          errors: [
            {
              message: 'slow',
              extensions: { code: 'RATELIMITED', statusCode: 429 },
            },
          ],
        },
      },
    ];
    for (const body of bodies) {
      fs.rmSync(root, { recursive: true, force: true });
      fs.mkdirSync(root, { recursive: true });
      let calls = 0;
      const first = await linearRequest({
        key,
        query: 'query { viewer { id } }',
        variables: {},
        fetchImpl: async () => {
          calls += 1;
          return new Response(JSON.stringify(body.data), {
            status: body.status,
          });
        },
        random: () => 0,
      });
      assert.equal(first.rateLimited, true);
      assert.equal(calls, 1);
      const second = await linearRequest({
        key,
        query: 'query { viewer { id } }',
        variables: {},
        fetchImpl: async () => {
          calls += 1;
          return new Response('{"data":{"ok":true}}', { status: 200 });
        },
      });
      assert.equal(second.rateLimited, true);
      assert.equal(calls, 1);
      const scope = join(root, credentialHash(key));
      const names = fs.readdirSync(scope);
      assert.equal(names.length, 1);
      assert.equal(
        fs.readFileSync(join(scope, names[0]), 'utf8').includes(key),
        false
      );
    }
  });

  it('honors a legacy single file and a legacy orchestrator directory', async () => {
    const key = 'legacy-secret';
    const now = Date.now();
    const resetAt = now + 90_000;
    const legacyFile = join(root, `${legacyKeyHash(key)}.json`);
    fs.writeFileSync(legacyFile, JSON.stringify({ schema: 1, resetAt }));
    assert.equal((await activeResetAt(key, now)) > now, true);

    fs.unlinkSync(legacyFile);
    const legacyRoot = mkdtempSync(join(tmpdir(), 'linear-legacy-'));
    try {
      const scope = join(legacyRoot, credentialHash(key));
      fs.mkdirSync(scope, { recursive: true, mode: 0o700 });
      fs.writeFileSync(
        join(scope, `${resetAt}-abcd.json`),
        JSON.stringify({ schema: 1, resetAt }),
        { mode: 0o600 }
      );
      const store = credentialBackoff(key, root, {
        legacyRoots: [legacyRoot],
        strict: false,
      });
      assert.equal(await store.read(now), resetAt);
    } finally {
      rmSync(legacyRoot, { recursive: true, force: true });
    }
  });

  it('keeps a private scope when concurrent publishers mkdir it together', async () => {
    const key = 'concurrent-mkdir-secret';
    const now = 1_700_000_000_000;
    for (let round = 0; round < 4; round += 1) {
      fs.rmSync(root, { recursive: true, force: true });
      fs.mkdirSync(root, { mode: 0o700 });
      const store = credentialBackoff(key, root);
      await Promise.all(
        Array.from({ length: 16 }, (_, index) =>
          store.publish(now + 60_000 + index)
        )
      );
      assert.equal(await store.read(now), now + 60_000 + 15);
    }
  });

  it('waits for an overlapping atomic publication before returning the latest deadline', async t => {
    fs.chmodSync(root, 0o700);
    const key = 'overlapping-publication-secret';
    const now = 1_700_000_000_000;
    const laterReset = now + 120_000;
    const writer = credentialBackoff(key, root);
    const reader = credentialBackoff(key, root);
    await writer.publish(now + 30_000);

    const fetch = t.mock.method(globalThis, 'fetch', async () => {
      throw new Error('this filesystem regression must not make requests');
    });
    const fsPromises = createRequire(import.meta.url)('node:fs/promises');
    const originalRename = fsPromises.rename;
    const originalReaddir = fsPromises.readdir;
    const renameReached = deferredSignal();
    const releaseRename = deferredSignal();
    const pendingObserved = deferredSignal();
    const readWaiting = deferredSignal();
    const waitingCallbacks = [];
    let monotonic = 0;
    let waitCount = 0;
    t.mock.method(performance, 'now', () => monotonic);
    t.mock.method(globalThis, 'setTimeout', callback => {
      waitCount += 1;
      if (waitCount === 1) waitingCallbacks.push(callback);
      else {
        monotonic += 600;
        queueMicrotask(callback);
      }
      readWaiting.resolve();
      return 0;
    });
    const operations = [];
    let publishing;
    fsPromises.rename = async (source, destination) => {
      if (
        String(destination).startsWith(join(writer.directory, `${laterReset}-`))
      ) {
        renameReached.resolve();
        await releaseRename.promise;
      }
      return originalRename(source, destination);
    };
    fsPromises.readdir = async (...args) => {
      const names = await originalReaddir(...args);
      if (
        String(args[0]) === reader.directory &&
        names.some(name => String(name).startsWith('.pending-'))
      ) {
        pendingObserved.resolve();
      }
      return names;
    };
    syncBuiltinESMExports();

    try {
      publishing = writer.publish(laterReset);
      operations.push(publishing);
      const publicationResult = Promise.allSettled([publishing]);
      await renameReached.promise;
      const reading = reader.read(now);
      operations.push(reading);
      let readSettled = false;
      const readResult = Promise.allSettled([reading]).then(result => {
        readSettled = true;
        return result;
      });
      await pendingObserved.promise;
      await Promise.race([readWaiting.promise, readResult]);
      assert.equal(readSettled, false, 'admission must wait for publication');
      releaseRename.resolve();
      assert.deepEqual(await publicationResult, [
        { status: 'fulfilled', value: undefined },
      ]);
      waitingCallbacks.splice(0).forEach(callback => callback());
      assert.equal(fetch.mock.callCount(), 0);
      assert.deepEqual(await readResult, [
        { status: 'fulfilled', value: laterReset },
      ]);
      assert.equal(await reader.read(now), laterReset);
      assert.equal(fetch.mock.callCount(), 0);
    } finally {
      releaseRename.resolve();
      await Promise.allSettled([publishing]);
      waitingCallbacks.splice(0).forEach(callback => callback());
      await Promise.allSettled(operations);
      fsPromises.rename = originalRename;
      fsPromises.readdir = originalReaddir;
      syncBuiltinESMExports();
    }
  });

  it('fails closed on an abandoned pending publication under one total wait bound', async t => {
    fs.chmodSync(root, 0o700);
    const store = credentialBackoff('abandoned-publication-secret', root);
    fs.mkdirSync(store.directory, { mode: 0o700 });
    const pending = join(
      store.directory,
      '.pending-00000000-0000-4000-8000-000000000000'
    );
    fs.writeFileSync(pending, JSON.stringify({ schema: 1, resetAt: 120_000 }), {
      mode: 0o600,
    });
    let monotonic = 0;
    const clock = t.mock.method(performance, 'now', () => monotonic);
    const waits = t.mock.method(globalThis, 'setTimeout', callback => {
      assert.ok(
        monotonic < 1_200,
        'rescanning must not reset the wait deadline'
      );
      monotonic += 600;
      queueMicrotask(callback);
      return 0;
    });
    const fetch = t.mock.method(globalThis, 'fetch', async () => {
      throw new Error('pending publication must not admit a network request');
    });
    await assert.rejects(store.read(0), { code: 'BACKOFF_STATE_INVALID' });
    assert.equal(waits.mock.callCount(), 2);
    assert.ok(clock.mock.callCount() >= 3);
    assert.equal(fetch.mock.callCount(), 0);
    assert.equal(
      fs.existsSync(pending),
      true,
      'readers never delete a publisher staging file'
    );
  });

  for (const removed of ['staging', 'scope']) {
    it(`fails closed when observed ${removed} disappears without a committed record`, async t => {
      fs.chmodSync(root, 0o700);
      const store = credentialBackoff('aborted-publication-secret', root);
      fs.mkdirSync(store.directory, { mode: 0o700 });
      const pending = join(
        store.directory,
        '.pending-00000000-0000-4000-8000-000000000000'
      );
      fs.writeFileSync(pending, '{', { mode: 0o600 });
      let monotonic = 0;
      t.mock.method(performance, 'now', () => monotonic);
      const waits = t.mock.method(globalThis, 'setTimeout', callback => {
        assert.ok(
          monotonic < 1_200,
          'aborted publication must retain the total bound'
        );
        fs.rmSync(removed === 'scope' ? store.directory : pending, {
          recursive: true,
          force: true,
        });
        monotonic += 600;
        queueMicrotask(callback);
        return 0;
      });
      await assert.rejects(store.read(0), { code: 'BACKOFF_STATE_INVALID' });
      assert.equal(waits.mock.callCount(), removed === 'scope' ? 1 : 2);
    });
  }

  it('does not restart the publication wait budget for a legacy scope', async t => {
    fs.chmodSync(root, 0o700);
    const legacyRoot = join(root, 'legacy');
    const key = 'shared-publication-deadline-secret';
    const store = credentialBackoff(key, root, { legacyRoots: [legacyRoot] });
    const legacyScope = join(legacyRoot, credentialHash(key));
    fs.mkdirSync(store.directory, { mode: 0o700 });
    fs.mkdirSync(legacyScope, { recursive: true, mode: 0o700 });
    const id = '00000000-0000-4000-8000-000000000000';
    const pending = join(store.directory, `.pending-${id}`);
    fs.writeFileSync(pending, JSON.stringify({ schema: 1, resetAt: 30_000 }), {
      mode: 0o600,
    });
    fs.writeFileSync(join(legacyScope, `.pending-${id}`), '{', { mode: 0o600 });
    let monotonic = 0;
    t.mock.method(performance, 'now', () => monotonic);
    const waits = t.mock.method(globalThis, 'setTimeout', callback => {
      assert.ok(
        monotonic < 1_200,
        'legacy scope must share the original deadline'
      );
      if (monotonic === 0)
        fs.renameSync(pending, join(store.directory, `30000-${id}.json`));
      monotonic += 600;
      queueMicrotask(callback);
      return 0;
    });
    await assert.rejects(store.read(0), { code: 'BACKOFF_STATE_INVALID' });
    assert.equal(waits.mock.callCount(), 2);
  });

  for (const variant of [
    'unknown-name',
    'nonprivate',
    'symlink',
    'directory',
    'oversized',
  ]) {
    it(`fails immediately on ${variant} staging without treating it as a live publication`, async t => {
      fs.chmodSync(root, 0o700);
      const store = credentialBackoff(`invalid-pending-${variant}`, root);
      fs.mkdirSync(store.directory, { mode: 0o700 });
      const pending = join(
        store.directory,
        variant === 'unknown-name'
          ? '.pending-abcd'
          : '.pending-00000000-0000-4000-8000-000000000000'
      );
      if (variant === 'symlink') fs.symlinkSync('/dev/null', pending);
      else if (variant === 'directory') fs.mkdirSync(pending, { mode: 0o700 });
      else
        fs.writeFileSync(
          pending,
          variant === 'oversized' ? 'x'.repeat(257) : '{',
          {
            mode: variant === 'nonprivate' ? 0o644 : 0o600,
          }
        );
      const waits = t.mock.method(globalThis, 'setTimeout', () => {
        throw new Error('unsafe staging must fail immediately');
      });
      await assert.rejects(store.read(0), { code: 'BACKOFF_STATE_INVALID' });
      assert.equal(waits.mock.callCount(), 0);
      assert.equal(
        fs.lstatSync(pending).isSymbolicLink(),
        variant === 'symlink'
      );
    });
  }

  it('a failed publish never throws', async () => {
    const key = 'unwritable-secret';
    const blocker = join(root, 'blocked');
    fs.writeFileSync(blocker, 'not a directory');
    const previousDir = process.env.LINEAR_COOLDOWN_STATE_DIR;
    process.env.LINEAR_COOLDOWN_STATE_DIR = blocker;
    try {
      const resetAt = await publishLaneCooldown(
        key,
        { get: () => undefined },
        Date.now(),
        () => 0
      );
      assert.ok(resetAt > Date.now());
    } finally {
      process.env.LINEAR_COOLDOWN_STATE_DIR = previousDir;
    }
  });

  it('LINEAR_COOLDOWN_FALLBACK_DIR overrides the fallback location', () => {
    const override = join(root, 'fallback-override');
    const previousFallback = process.env.LINEAR_COOLDOWN_FALLBACK_DIR;
    process.env.LINEAR_COOLDOWN_FALLBACK_DIR = override;
    try {
      assert.equal(fallbackCooldownRoot(), override);
    } finally {
      if (previousFallback === undefined)
        delete process.env.LINEAR_COOLDOWN_FALLBACK_DIR;
      else process.env.LINEAR_COOLDOWN_FALLBACK_DIR = previousFallback;
    }
    const uid = process.getuid ? process.getuid() : 'shared';
    assert.equal(
      fallbackCooldownRoot(),
      join(tmpdir(), `jovie-linear-cooldown-${uid}`)
    );
  });

  it('an unwritable state dir still backs siblings off and reports (JOV-7577)', async () => {
    const key = 'fallback-secret';
    const blocker = join(root, 'unwritable');
    fs.writeFileSync(blocker, 'not a directory');
    const fallbackScope = join(fallbackCooldownRoot(), credentialHash(key));
    fs.rmSync(fallbackScope, { recursive: true, force: true });
    const previousDir = process.env.LINEAR_COOLDOWN_STATE_DIR;
    const logged = [];
    const consoleError = console.error;
    console.error = (...args) => logged.push(args.join(' '));
    process.env.LINEAR_COOLDOWN_STATE_DIR = blocker;
    try {
      const resetAt = await publishLaneCooldown(
        key,
        { get: () => undefined },
        Date.now(),
        () => 0
      );
      assert.ok(resetAt > Date.now());
      assert.ok(
        logged.some(line => line.includes('linear-cooldown-unwritable')),
        'the write failure must be logged loudly'
      );
      // The deadline survived without the canonical dir: siblings see the tmp
      // record and this process keeps its own copy.
      assert.equal((await activeResetAt(key, Date.now())) >= resetAt, true);
      const names = fs
        .readdirSync(fallbackScope)
        .filter(name => /^\d+-[0-9a-f-]+\.json$/.test(name));
      assert.equal(names.length >= 1, true);
      let calls = 0;
      const skipped = await linearRequest({
        key,
        query: 'query { viewer { id } }',
        variables: {},
        fetchImpl: async () => {
          calls += 1;
          return new Response('{"data":{"ok":true}}', { status: 200 });
        },
      });
      assert.equal(skipped.rateLimited, true);
      assert.equal(calls, 0);
    } finally {
      console.error = consoleError;
      process.env.LINEAR_COOLDOWN_STATE_DIR = previousDir;
      fs.rmSync(fallbackScope, { recursive: true, force: true });
    }
  });
});

describe('callers honor the cooldown', () => {
  it('qa-swarm, deprecation intake and synthetic intake do not call Linear while cooling', async () => {
    const key = 'caller-secret';
    process.env.LINEAR_API_KEY = key;
    await publishLaneCooldown(
      key,
      { get: () => undefined },
      Date.now(),
      () => 0
    );
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      throw new Error('network');
    };
    const filed = await fileLinearIssue({ title: 't', description: 'd' });
    assert.equal(filed.success, false);
    assert.match(filed.error, /linear rate limited/);
    await assert.rejects(
      resolveLabelId('devin', key, fetchImpl),
      /linear rate limited/
    );
    const intake = await upsertLinearIssueByTitleFingerprint({
      fingerprint: 'synthetic-monitoring:abc',
      title: 'P0 synthetic',
      description: 'failed',
      apiKey: key,
      fetchImpl,
    });
    assert.equal(intake.reason, 'linear_rate_limited');
    assert.equal(calls, 0);
  });
});

process.on('exit', () => {
  rmSync(root, { recursive: true, force: true });
  if (previous.dir === undefined) delete process.env.LINEAR_COOLDOWN_STATE_DIR;
  else process.env.LINEAR_COOLDOWN_STATE_DIR = previous.dir;
  if (previous.lanes === undefined) delete process.env.LANES_STATE;
  else process.env.LANES_STATE = previous.lanes;
  if (previous.backoff === undefined)
    delete process.env.LINEAR_BACKOFF_STATE_DIR;
  else process.env.LINEAR_BACKOFF_STATE_DIR = previous.backoff;
  if (previous.key === undefined) delete process.env.LINEAR_API_KEY;
  else process.env.LINEAR_API_KEY = previous.key;
});

describe('linearAuthorization', () => {
  it('sends personal keys raw and OAuth tokens as Bearer', async () => {
    const { linearAuthorization } = await import('../linear-cooldown.mjs');
    assert.equal(linearAuthorization('lin_api_abc'), 'lin_api_abc');
    assert.equal(linearAuthorization('lin_oauth_abc'), 'Bearer lin_oauth_abc');
    assert.equal(linearAuthorization('Bearer xyz'), 'Bearer xyz');
  });
});
