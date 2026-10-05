import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
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
