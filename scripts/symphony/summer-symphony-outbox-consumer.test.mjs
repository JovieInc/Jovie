import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
  canonical,
  configFromEnvironment,
  createFileJournal,
  createHttpTransport,
  createLinearProjector,
  createOwnedRepairExecutor,
  DISCOVERY_CURSOR_SCHEMA,
  discoverOne,
  EXECUTION_HOLD,
  OUTBOX_DOMAIN,
  OUTBOX_DOMAIN_V2,
  OUTBOX_DOMAIN_V3,
  OUTBOX_PATH,
  OUTCOME_DOMAIN_V3,
  OUTCOME_PATH,
  PAGE_SCHEMA,
  parseVerificationKeys,
  READ_DOMAIN,
  runCycle,
  signedReadHeaders,
  signOutcomeV2,
  signOutcomeV3,
  validateExecutionEvidenceV3,
  validateOutcomeV3,
  validateState,
  validateTask,
  verifyOutboxRecord,
} from './summer-symphony-outbox-consumer.mjs';

function pair() {
  const keys = generateKeyPairSync('ed25519');
  return {
    privateKey: keys.privateKey
      .export({ format: 'pem', type: 'pkcs8' })
      .toString(),
    publicKey: keys.publicKey
      .export({ format: 'pem', type: 'spki' })
      .toString(),
  };
}

const summer = pair();
const host = pair();
const foreign = pair();
const taskKey = 'a'.repeat(64);
const keys = new Map([['summer-outbox', summer.publicKey]]);
const existingRepairFixture = JSON.parse(
  readFileSync(
    new URL('./test-vectors/symphony-existing-repair-v3.json', import.meta.url),
    'utf8'
  )
);

function task(overrides = {}) {
  return {
    schema: 'jovie-symphony-repair-task/v1',
    taskKey,
    createdAt: '2026-09-07T01:00:00Z',
    owner: 'symphony',
    route: 'symphony',
    authority: 'source-repair-only-no-direct-pr-queue-or-deploy-mutation',
    action: 'remediate-selected-ci-audit-class',
    issue: 'JOV-5853',
    safety: 'exact-source-ci-native-queue-production-gates-remain-required',
    selected: {
      id: 'affected-only-unit-selection',
      sourceRevision: 'b'.repeat(40),
      sourceDigest: 'c'.repeat(64),
      owner: 'ci-reliability',
      handle: 'audit:affected-only',
    },
    source: {
      sourceVersion: 'b'.repeat(40),
      snapshotDigest: 'd'.repeat(64),
    },
    ...overrides,
  };
}

/** @param {any} taskValue */
function signedOutbox(
  taskValue = task(),
  signing = summer,
  keyId = 'summer-outbox'
) {
  const domain =
    taskValue.schema === 'jovie-symphony-repair-task/v3'
      ? OUTBOX_DOMAIN_V3
      : taskValue.schema === 'jovie-symphony-repair-task/v2'
        ? OUTBOX_DOMAIN_V2
        : OUTBOX_DOMAIN;
  const unsigned = {
    schema: domain,
    destination: 'symphony',
    idempotencyKey: taskValue.taskKey,
    status: 'ready',
    task: taskValue,
    signatureKeyId: keyId,
  };
  return {
    ...unsigned,
    signature: `ed25519=${sign(
      null,
      Buffer.from(`${domain}\0${canonical(unsigned)}`),
      signing.privateKey
    ).toString('base64url')}`,
  };
}

function taskV2(overrides = {}) {
  const { issue: _fixedV1Issue, ...base } = task();
  const nextKey = overrides.taskKey ?? base.taskKey;
  const selected = overrides.selected ?? base.selected;
  const action = overrides.action ?? base.action;
  const source = overrides.source ?? base.source;
  return {
    ...base,
    schema: 'jovie-symphony-repair-task/v2',
    taskKey: nextKey,
    decisionFingerprint: nextKey,
    authority: 'linear-child-projection-only',
    linearProjection: {
      mutation: 'create-child-issue',
      team: 'JOV',
      parentIssue: 'JOV-5853',
      title: `[summer-task:${nextKey}] ${selected.id}`,
      description: `[summer-task:${nextKey}]\n\nSelected: ${selected.id}\nAction: ${action}\nSource: ${source.sourceVersion}`,
      initialState: 'Todo',
      labels: ['symphony'],
    },
    ...overrides,
  };
}

function page(
  records,
  cursor = null,
  hasMore = false,
  scanned = records.length
) {
  return { schema: PAGE_SCHEMA, records, cursor, hasMore, scanned };
}

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('Summer Symphony authenticated transport', () => {
  it('matches the fixed Summer-owned canonical and signature vector', () => {
    const unsigned = {
      zeta: 'line 1\nline 2 ☃',
      alpha: { quote: 'say "hi"', slash: 'a/b' },
      array: ['second', 'first', { beta: 2, alpha: 1 }],
      signatureKeyId: 'rfc8032-test',
    };
    const expectedCanonical =
      '{"alpha":{"quote":"say \\"hi\\"","slash":"a/b"},"array":["second","first",{"alpha":1,"beta":2}],"signatureKeyId":"rfc8032-test","zeta":"line 1\\nline 2 ☃"}';
    const publicKey =
      '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=\n-----END PUBLIC KEY-----\n';
    const signature =
      'CFzkDkkx2_JQ44_nwOGOS7cNiVcPo_kMcd9wl1fYAsNCQtcDRI0irDj2fFHiw84lsOcfYqbviJwICtVAjmU8BA';
    assert.equal(canonical(unsigned), expectedCanonical);
    assert.equal(
      verify(
        null,
        Buffer.from(`summer.canonical-test/v1\0${expectedCanonical}`),
        publicKey,
        Buffer.from(signature, 'base64url')
      ),
      true
    );
  });

  it('signs the exact path and escaped query target with the host key', () => {
    const target = `${OUTBOX_PATH}?limit=25&cursor=a%2Fb%3Fc`;
    const headers = signedReadHeaders(
      target,
      Date.parse('2026-09-07T01:00:00Z'),
      host.privateKey,
      'host-outcome',
      'nonce_1234567890'
    );
    const unsigned = {
      method: 'GET',
      target,
      timestamp: headers['x-summer-timestamp'],
      nonce: headers['x-summer-nonce'],
      signatureKeyId: headers['x-summer-key-id'],
    };
    assert.equal(
      verify(
        null,
        Buffer.from(`${READ_DOMAIN}\0${canonical(unsigned)}`),
        host.publicKey,
        Buffer.from(
          headers['x-summer-signature'].slice('ed25519='.length),
          'base64url'
        )
      ),
      true
    );
  });

  it('transmits the once-encoded cursor and never sends proof material in the URL', async () => {
    /** @type {any} */
    let request;
    const transport = createHttpTransport(
      {
        summerOrigin: 'https://summer.example',
        outcomePrivateKey: host.privateKey,
        outcomeKeyId: 'host-outcome',
      },
      async (url, options) => {
        request = { url, options };
        return new Response(JSON.stringify(page([])), { status: 200 });
      }
    );
    await transport.readPage('a/b?c', 25);
    assert.ok(request);
    assert.equal(
      request.url,
      `https://summer.example${OUTBOX_PATH}?limit=25&cursor=a%2Fb%3Fc`
    );
    assert.equal(new URL(request.url).searchParams.has('signature'), false);
    assert.match(request.options.headers['x-summer-signature'], /^ed25519=/u);
  });
});

describe('Summer outbox record authority', () => {
  it('accepts the current signed wire record', () => {
    assert.equal(verifyOutboxRecord(signedOutbox(), keys).taskKey, taskKey);
  });

  it('rejects old wire, foreign signing authority, and same-key tampering', () => {
    assert.throws(
      () =>
        verifyOutboxRecord(
          { ...signedOutbox(), schema: 'jovie.eve.symphony-repair-outbox/v0' },
          keys
        ),
      /outbox-record-invalid/
    );
    assert.throws(
      () =>
        verifyOutboxRecord(signedOutbox(task(), foreign, 'foreign-key'), keys),
      /outbox-signing-key-unknown/
    );
    assert.throws(
      () =>
        verifyOutboxRecord({ ...signedOutbox(), destination: 'linear' }, keys),
      /outbox-record-invalid/
    );
    assert.throws(
      () =>
        verifyOutboxRecord(
          { ...signedOutbox(), signature: `ed25519=${'a'.repeat(86)}` },
          keys
        ),
      /outbox-signature-invalid/
    );
  });

  it('accepts the native-queue-starvation repair task bound to its action', () => {
    const queueTask = task({
      action: 'reconcile-native-queue-starvation',
      selected: {
        id: 'native-queue-starvation',
        sourceRevision: 'b'.repeat(40),
        sourceDigest: 'c'.repeat(64),
        owner: 'Summer',
        handle: 'symphony',
      },
    });
    assert.deepEqual(
      verifyOutboxRecord(signedOutbox(queueTask), keys),
      queueTask
    );
    assert.throws(
      () =>
        verifyOutboxRecord(
          signedOutbox(
            task({
              action: 'reconcile-native-queue-starvation',
              selected: {
                id: 'affected-only-unit-selection',
                sourceRevision: 'b'.repeat(40),
                sourceDigest: 'c'.repeat(64),
                owner: 'ci-reliability',
                handle: 'audit:affected-only',
              },
            })
          ),
          keys
        ),
      /action-cross-bound/
    );
  });

  it('accepts the closure-health-red repair task bound to its action', () => {
    const closureTask = task({
      action: 'reconcile-closure-health-red',
      selected: {
        id: 'closure-health-red',
        sourceRevision: 'b'.repeat(40),
        sourceDigest: 'c'.repeat(64),
        owner: 'Summer',
        handle: 'symphony',
      },
    });
    assert.deepEqual(
      verifyOutboxRecord(signedOutbox(closureTask), keys),
      closureTask
    );
    assert.throws(
      () =>
        verifyOutboxRecord(
          signedOutbox(
            task({
              action: 'reconcile-closure-health-red',
              selected: {
                id: 'affected-only-unit-selection',
                sourceRevision: 'b'.repeat(40),
                sourceDigest: 'c'.repeat(64),
                owner: 'ci-reliability',
                handle: 'audit:affected-only',
              },
            })
          ),
          keys
        ),
      /action-cross-bound/
    );
  });

  it('accepts the runner-capacity-starvation repair task bound to its action', () => {
    const runnerTask = task({
      action: 'reconcile-runner-capacity-starvation',
      selected: {
        id: 'runner-capacity-starvation',
        sourceRevision: 'b'.repeat(40),
        sourceDigest: 'c'.repeat(64),
        owner: 'Summer',
        handle: 'symphony',
      },
    });
    assert.deepEqual(
      verifyOutboxRecord(signedOutbox(runnerTask), keys),
      runnerTask
    );
    assert.throws(
      () =>
        verifyOutboxRecord(
          signedOutbox(
            task({
              action: 'reconcile-runner-capacity-starvation',
              selected: {
                id: 'affected-only-unit-selection',
                sourceRevision: 'b'.repeat(40),
                sourceDigest: 'c'.repeat(64),
                owner: 'ci-reliability',
                handle: 'audit:affected-only',
              },
            })
          ),
          keys
        ),
      /action-cross-bound/
    );
  });

  it('rejects cross-source, cross-action, cross-task, and extra-field records', () => {
    const crossSource = task({
      source: { sourceVersion: 'e'.repeat(40), snapshotDigest: 'd'.repeat(64) },
    });
    assert.throws(
      () => verifyOutboxRecord(signedOutbox(crossSource), keys),
      /cross-bound/
    );
    assert.throws(
      () =>
        verifyOutboxRecord(
          signedOutbox(
            task({ action: 'reconcile-release-certification-starvation' })
          ),
          keys
        ),
      /action-cross-bound/
    );
    assert.throws(
      () =>
        verifyOutboxRecord(
          { ...signedOutbox(), idempotencyKey: 'f'.repeat(64) },
          keys
        ),
      /task-key-cross-bound/
    );
    assert.throws(
      () =>
        verifyOutboxRecord(
          { ...signedOutbox(), legacyTarget: 'JOV-9999' },
          keys
        ),
      /outbox-record-invalid/
    );
  });

  it('rejects non-wire timestamps and non-Ed25519 or private verification keys', () => {
    assert.throws(
      () =>
        verifyOutboxRecord(
          signedOutbox(task({ createdAt: 'September 7, 2026' })),
          keys
        ),
      /cross-bound/
    );
    assert.throws(
      () =>
        verifyOutboxRecord(
          signedOutbox(task({ createdAt: '2026-02-30T01:00:00Z' })),
          keys
        ),
      /cross-bound/
    );
    const p256 = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
    for (const key of [
      p256.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      rsa.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      summer.privateKey,
    ]) {
      assert.throws(
        () => parseVerificationKeys(JSON.stringify({ 'wrong-type': key })),
        /verification-keys-invalid/
      );
    }
  });

  it('accepts strict v2 projection authority and rejects v1 or projection reinterpretation', () => {
    const v2 = signedOutbox(taskV2());
    assert.equal(verifyOutboxRecord(v2, keys).decisionFingerprint, taskKey);
    const wrongProjection = taskV2({
      linearProjection: {
        ...taskV2().linearProjection,
        parentIssue: 'JOV-6001',
      },
    });
    assert.throws(
      () => verifyOutboxRecord(signedOutbox(wrongProjection), keys),
      /projection-cross-bound/
    );
    const crossed = { ...v2, schema: OUTBOX_DOMAIN };
    const { signature: _signature, ...unsigned } = crossed;
    crossed.signature = `ed25519=${sign(
      null,
      Buffer.from(`${OUTBOX_DOMAIN}\0${canonical(unsigned)}`),
      summer.privateKey
    ).toString('base64url')}`;
    assert.throws(
      () => verifyOutboxRecord(crossed, keys),
      /version-cross-bound/
    );
  });
});

describe('bounded discovery and durable WIP=1 hold', () => {
  it('continues past an empty corrupt-only page when hasMore is true', async () => {
    const calls = [];
    const pages = [
      page([], 'next', true, 25),
      page([signedOutbox()], null, false, 1),
    ];
    const found = await discoverOne(
      {
        readPage: async cursor => {
          calls.push(cursor);
          return pages.shift();
        },
      },
      keys
    );
    assert.equal(found.taskKey, taskKey);
    assert.deepEqual(calls, [null, 'next']);
  });

  it('rejects empty hasMore pagination with a missing, repeated, or over-budget cursor', async () => {
    await assert.rejects(
      discoverOne({ readPage: async () => page([], null, true, 25) }, keys),
      /outbox-page-invalid/
    );
    let calls = 0;
    await assert.rejects(
      discoverOne(
        {
          readPage: async cursor => {
            calls += 1;
            return page([], cursor ?? 'same', true, 25);
          },
        },
        keys
      ),
      /outbox-page-invalid/
    );
    let cursor = 0;
    await assert.rejects(
      discoverOne(
        { readPage: async () => page([], String(++cursor), true, 25) },
        keys
      ),
      /outbox-page-limit-exceeded/
    );
    assert.equal(calls, 2);
  });

  it('rejects a cursor beyond the signed-target bound', async () => {
    await assert.rejects(
      discoverOne(
        { readPage: async () => page([], 'x'.repeat(2049), true, 0) },
        keys
      ),
      /outbox-page-invalid/
    );
  });

  it('rejects conflicting same-key records and returns idle at the terminal page', async () => {
    const conflict = signedOutbox(
      task({
        selected: {
          ...task().selected,
          handle: 'audit:conflicting-handle',
        },
      })
    );
    await assert.rejects(
      discoverOne(
        { readPage: async () => page([signedOutbox(), conflict]) },
        keys
      ),
      /outbox-task-conflict/
    );
    assert.equal(
      await discoverOne({ readPage: async () => page([]) }, keys),
      null
    );
  });

  it('journals once, replays after restart, and never interprets JOV-5853 as write authority', async () => {
    const root = mkdtempSync(join(tmpdir(), 'summer-symphony-consumer-'));
    roots.push(root);
    const journal = createFileJournal(root, keys);
    let reads = 0;
    const transport = {
      readPage: async () => {
        reads += 1;
        return page([signedOutbox()]);
      },
    };
    const first = await runCycle({ journal, transport, keys });
    const bytes = readFileSync(journal.path, 'utf8');
    const replay = await runCycle({
      journal: createFileJournal(root, keys),
      transport,
      keys,
    });
    assert.deepEqual(first, {
      status: 'execution-held',
      taskKey,
      reason: EXECUTION_HOLD,
    });
    assert.deepEqual(replay, first);
    assert.equal(reads, 1);
    assert.equal(readFileSync(journal.path, 'utf8'), bytes);
    assert.equal(bytes.includes('JOV-5853'), true);
    assert.equal(bytes.includes('linearIssue'), false);
  });

  it('serializes concurrent journals so only one immutable WIP winner is discovered', async () => {
    const root = mkdtempSync(join(tmpdir(), 'summer-symphony-concurrent-'));
    roots.push(root);
    const firstJournal = createFileJournal(root, keys);
    const secondJournal = createFileJournal(root, keys);
    let releaseFirst = () => {};
    let firstEntered = () => {};
    const entered = new Promise(resolve => {
      firstEntered = () => resolve();
    });
    const release = new Promise(resolve => {
      releaseFirst = () => resolve();
    });
    const first = runCycle({
      journal: firstJournal,
      keys,
      transport: {
        readPage: async () => {
          firstEntered();
          await release;
          return page([signedOutbox()]);
        },
      },
    });
    await entered;
    let secondReads = 0;
    const second = runCycle({
      journal: secondJournal,
      keys,
      transport: {
        readPage: async () => {
          secondReads += 1;
          return page([signedOutbox(task({ taskKey: 'f'.repeat(64) }))]);
        },
      },
    });
    releaseFirst();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    assert.deepEqual(secondResult, firstResult);
    assert.equal(secondReads, 1);
    assert.equal(
      createFileJournal(root, keys).read().active.taskKey,
      firstResult.taskKey
    );
  });

  it('projects one strict v2 child and persists exact outcome bytes before acknowledgement', async () => {
    const v2Task = taskV2();
    const record = signedOutbox(v2Task);
    const issue = {
      id: 'linear-child-id',
      identifier: 'JOV-6001',
      title: v2Task.linearProjection.title,
      description: v2Task.linearProjection.description,
      createdAt: '2026-09-07T03:00:00Z',
      parent: { identifier: 'JOV-5853' },
      team: { key: 'JOV' },
      state: { name: 'Todo' },
      labels: { nodes: [{ name: 'symphony' }] },
    };
    let state = {
      schema: 'jovie.summer-symphony-consumer-state/v1',
      active: null,
    };
    const journal = {
      read: () => state,
      write: next => {
        state = structuredClone(next);
      },
    };
    /** @type {any} */
    let posted;
    const result = await runCycle({
      journal,
      keys,
      transport: {
        readPage: async () => page([record]),
        writeOutcome: async outcome => {
          posted = structuredClone(outcome);
          assert.equal(state.active.phase, 'outcome-pending');
          assert.deepEqual(state.active.outcome, outcome);
          return {
            schema: 'summer.symphony-outcome-ack/v1',
            taskKey,
            status: 'recorded',
          };
        },
      },
      projector: { project: async () => issue },
      outcomePrivateKey: host.privateKey,
      outcomePublicKey: host.publicKey,
      outcomeKeyId: 'host-outcome',
    });
    assert.deepEqual(result, {
      status: 'projection-recorded',
      taskKey,
      issueIdentifier: 'JOV-6001',
      acknowledgement: 'recorded',
      action: v2Task.action,
      sourceVersion: v2Task.source.sourceVersion,
      snapshotDigest: v2Task.source.snapshotDigest,
    });
    assert.ok(posted);
    assert.equal(posted.decisionFingerprint, taskKey);
    assert.deepEqual(posted.linearProjection, v2Task.linearProjection);
    assert.equal(state.active, null);
  });

  it('replays byte-identical pending outcomes without a second Linear projection', async () => {
    const v2Task = taskV2();
    const record = signedOutbox(v2Task);
    const issue = {
      identifier: 'JOV-6002',
      createdAt: '2026-09-07T03:01:00Z',
    };
    const outcome = signOutcomeV2(
      v2Task,
      issue,
      host.privateKey,
      'host-outcome'
    );
    let state = {
      schema: 'jovie.summer-symphony-consumer-state/v1',
      active: { phase: 'outcome-pending', taskKey, record, outcome },
    };
    const journal = {
      read: () => state,
      write: next => {
        state = structuredClone(next);
      },
    };
    let projections = 0;
    let posts = 0;
    const transport = {
      writeOutcome: async received => {
        posts += 1;
        assert.deepEqual(received, outcome);
        if (posts === 1) throw new Error('ambiguous-network');
        return {
          schema: 'summer.symphony-outcome-ack/v1',
          taskKey,
          status: 'replay',
        };
      },
    };
    const options = {
      journal,
      transport,
      keys,
      projector: { project: async () => (projections += 1) },
      outcomePrivateKey: host.privateKey,
      outcomePublicKey: host.publicKey,
      outcomeKeyId: 'host-outcome',
    };
    await assert.rejects(runCycle(options), /ambiguous-network/);
    assert.equal(state.active.phase, 'outcome-pending');
    await runCycle(options);
    assert.equal(projections, 0);
    assert.equal(posts, 2);
    assert.equal(state.active, null);
  });

  it('clears an acknowledged file-journal claim so the next distinct task can publish', async () => {
    const root = mkdtempSync(join(tmpdir(), 'summer-symphony-sequential-'));
    roots.push(root);
    const secondKey = 'f'.repeat(64);
    const tasks = [taskV2(), taskV2({ taskKey: secondKey })];
    let index = 0;
    const options = {
      journal: createFileJournal(root, keys, host.publicKey),
      keys,
      transport: {
        readPage: async () => page([signedOutbox(tasks[index])]),
        writeOutcome: async outcome => ({
          schema: 'summer.symphony-outcome-ack/v1',
          taskKey: outcome.taskKey,
          status: 'recorded',
        }),
      },
      projector: {
        project: async current => ({
          identifier: index === 0 ? 'JOV-6004' : 'JOV-6005',
          createdAt: `2026-09-07T03:0${index + 3}:00Z`,
          title: current.linearProjection.title,
        }),
      },
      outcomePrivateKey: host.privateKey,
      outcomePublicKey: host.publicKey,
      outcomeKeyId: 'host-outcome',
    };
    assert.equal((await runCycle(options)).taskKey, taskKey);
    assert.throws(() => readFileSync(options.journal.path), /ENOENT/);
    index = 1;
    assert.equal((await runCycle(options)).taskKey, secondKey);
    assert.throws(() => readFileSync(options.journal.path), /ENOENT/);
  });

  it('persists bounded discovery progress across restart and reaches a task beyond the page budget', async () => {
    const root = mkdtempSync(join(tmpdir(), 'summer-symphony-pagination-'));
    roots.push(root);
    const record = signedOutbox(taskV2());
    const cursors = [null, 'page-1', 'page-2', 'page-3', 'page-4'];
    const journal = createFileJournal(root, keys, host.publicKey);
    const reads = [];
    const options = {
      journal,
      keys,
      transport: {
        readPage: async cursor => {
          reads.push(cursor);
          const index = cursors.indexOf(cursor);
          assert.notEqual(index, -1);
          if (index === cursors.length - 1) return page([record]);
          return page([], cursors[index + 1], true, 25);
        },
        writeOutcome: async outcome => ({
          schema: 'summer.symphony-outcome-ack/v1',
          taskKey: outcome.taskKey,
          status: 'recorded',
        }),
      },
      projector: {
        project: async current => ({
          identifier: 'JOV-6006',
          createdAt: '2026-09-07T03:06:00Z',
          title: current.linearProjection.title,
        }),
      },
      outcomePrivateKey: host.privateKey,
      outcomePublicKey: host.publicKey,
      outcomeKeyId: 'host-outcome',
    };

    assert.deepEqual(await runCycle(options), { status: 'scan-deferred' });
    assert.deepEqual(
      JSON.parse(readFileSync(journal.discoveryCursorPath, 'utf8')),
      { schema: DISCOVERY_CURSOR_SCHEMA, cursor: 'page-4' }
    );

    const restarted = {
      ...options,
      journal: createFileJournal(root, keys, host.publicKey),
    };
    assert.equal((await runCycle(restarted)).taskKey, taskKey);
    assert.deepEqual(reads, [null, 'page-1', 'page-2', 'page-3', 'page-4']);
    assert.throws(
      () => readFileSync(restarted.journal.discoveryCursorPath),
      /ENOENT/
    );
    assert.throws(() => readFileSync(restarted.journal.path), /ENOENT/);
  });

  it('rejects symlinked state directories and world-readable state files', () => {
    const symlinkRoot = mkdtempSync(join(tmpdir(), 'summer-symphony-symlink-'));
    const outside = mkdtempSync(join(tmpdir(), 'summer-symphony-outside-'));
    roots.push(symlinkRoot, outside);
    symlinkSync(outside, join(symlinkRoot, 'state'));
    assert.throws(
      () => createFileJournal(symlinkRoot, keys).read(),
      /directory-unsafe/
    );

    const modeRoot = mkdtempSync(join(tmpdir(), 'summer-symphony-mode-'));
    roots.push(modeRoot);
    mkdirSync(join(modeRoot, 'state'), { mode: 0o700 });
    const journal = createFileJournal(modeRoot, keys);
    journal.write({
      schema: 'jovie.summer-symphony-consumer-state/v1',
      active: null,
    });
    chmodSync(journal.path, 0o644);
    assert.throws(() => journal.read(), /file-unsafe/);

    const cursorRoot = mkdtempSync(
      join(tmpdir(), 'summer-symphony-cursor-mode-')
    );
    roots.push(cursorRoot);
    const cursorJournal = createFileJournal(cursorRoot, keys);
    cursorJournal.writeDiscoveryCursor('page-4');
    chmodSync(cursorJournal.discoveryCursorPath, 0o644);
    assert.throws(() => cursorJournal.readDiscoveryCursor(), /file-unsafe/);
  });

  it('fails closed on tampered durable state and recovers safely after local-state loss', async () => {
    const record = signedOutbox();
    const state = {
      schema: 'jovie.summer-symphony-consumer-state/v1',
      active: null,
    };
    let writes = 0;
    const journal = {
      read: () => state,
      write: next => {
        state.active = next.active;
        writes += 1;
      },
    };
    const transport = { readPage: async () => page([record]) };
    const v1OnlyOptions = {
      journal,
      transport,
      keys,
      projector: null,
      outcomePrivateKey: null,
      outcomePublicKey: null,
      outcomeKeyId: null,
    };
    await runCycle(v1OnlyOptions);
    state.active.record.task.source.sourceVersion = 'e'.repeat(40);
    assert.throws(
      () => verifyOutboxRecord(state.active.record, keys),
      /cross-bound|signature-invalid/
    );
    state.active = null; // simulated local loss; no provider mutation can duplicate
    const recoveredRecord = signedOutbox();
    transport.readPage = async () => page([recoveredRecord]);
    await runCycle(v1OnlyOptions);
    assert.equal(writes, 2);
    assert.equal(state.active.taskKey, taskKey);
  });

  it('rejects malformed journal envelopes and invalid persisted JSON', () => {
    assert.throws(
      () => validateState({ schema: 'old/v0', active: null }, keys),
      /consumer-state-invalid/
    );
    assert.throws(
      () =>
        validateState(
          {
            schema: 'jovie.summer-symphony-consumer-state/v1',
            active: {
              phase: 'projected',
              hold: EXECUTION_HOLD,
              taskKey,
              record: signedOutbox(),
            },
          },
          keys
        ),
      /consumer-state-invalid/
    );
    const root = mkdtempSync(join(tmpdir(), 'summer-symphony-invalid-'));
    roots.push(root);
    const journal = createFileJournal(root, keys);
    journal.write({
      schema: 'jovie.summer-symphony-consumer-state/v1',
      active: null,
    });
    writeFileSync(journal.path, '{');
    assert.throws(() => journal.read(), /JSON/);
  });
});

describe('configuration boundaries', () => {
  it('requires HTTPS, absolute GEM_WORKSPACE, and the dedicated Linear writer only', () => {
    const environment = {
      SUMMER_BOTTLENECK_ORIGIN: 'https://summer.example',
      GEM_WORKSPACE: '/srv/gem',
      SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_PRIVATE_KEY: host.privateKey,
      SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_KEY_ID: 'host-outcome',
      SUMMER_BOTTLENECK_EVE_OUTBOX_VERIFICATION_KEYS_JSON: JSON.stringify({
        'summer-outbox': summer.publicKey,
      }),
      LINEAR_API_KEY: 'must-not-be-consumed',
      SUMMER_LINEAR_GOVERNOR_API_KEY: 'dedicated-writer',
      SUMMER_BOTTLENECK_VERCEL_AUTOMATION_BYPASS_SECRET:
        'scoped-vercel-bypass-secret',
    };
    const config = configFromEnvironment(environment);
    assert.equal(Object.hasOwn(config, 'linearKey'), false);
    assert.equal(config.linearApiKey, 'dedicated-writer');
    assert.notEqual(config.linearApiKey, environment.LINEAR_API_KEY);
    assert.equal(
      config.vercelAutomationBypassSecret,
      'scoped-vercel-bypass-secret'
    );
    assert.throws(
      () =>
        configFromEnvironment({
          ...environment,
          SUMMER_BOTTLENECK_EVE_OUTBOX_VERIFICATION_KEYS_JSON: JSON.stringify({
            'summer-outbox': host.publicKey,
          }),
        }),
      /signing-authority-overlap/
    );
    assert.throws(
      () =>
        configFromEnvironment({
          ...environment,
          SUMMER_BOTTLENECK_ORIGIN: 'http://summer.example',
        }),
      /ORIGIN-invalid/
    );
    for (const invalidOrigin of [
      'https://user@summer.example',
      'https://localhost',
      'https://localhost.',
      'https://127.0.0.1',
      'https://[::1]',
      'https://[fe80::1]',
      'https://[::ffff:127.0.0.1]',
      'https://summer.example:8443',
      'https://summer.example/path',
    ]) {
      assert.throws(
        () =>
          configFromEnvironment({
            ...environment,
            SUMMER_BOTTLENECK_ORIGIN: invalidOrigin,
          }),
        /ORIGIN-invalid/
      );
    }
    assert.throws(
      () =>
        configFromEnvironment({ ...environment, GEM_WORKSPACE: 'relative' }),
      /must-be-absolute/
    );
    assert.throws(
      () => configFromEnvironment({}),
      /missing-SUMMER_BOTTLENECK_ORIGIN/
    );
    assert.throws(
      () =>
        configFromEnvironment({
          ...environment,
          SUMMER_BOTTLENECK_VERCEL_AUTOMATION_BYPASS_SECRET: 'short',
        }),
      /BYPASS_SECRET-invalid/
    );
    assert.throws(
      () => parseVerificationKeys('{'),
      /verification-keys-invalid/
    );
    for (const invalid of ['null', '[]', '{}', '{"bad id":"key"}']) {
      assert.throws(
        () => parseVerificationKeys(invalid),
        /verification-keys-invalid/
      );
    }
    assert.throws(
      () =>
        signedReadHeaders(
          OUTBOX_PATH,
          0,
          host.privateKey,
          'host-outcome',
          'short'
        ),
      /read-proof-input-invalid/
    );
  });

  it('fails closed on HTTP and JSON errors without printing secrets', async () => {
    const config = {
      summerOrigin: 'https://summer.example',
      outcomePrivateKey: host.privateKey,
      outcomeKeyId: 'host-outcome',
    };
    await assert.rejects(
      createHttpTransport(
        config,
        async () => new Response('', { status: 503 })
      ).readPage(null, 25),
      /summer-outbox-http-503/
    );
    await assert.rejects(
      createHttpTransport(
        config,
        async () => new Response('{', { status: 200 })
      ).readPage(null, 25),
      /summer-outbox-invalid-json/
    );
    await assert.rejects(
      createHttpTransport(
        config,
        async () =>
          new Response('x', {
            status: 200,
            headers: { 'content-length': String(1024 * 1024 + 1) },
          })
      ).readPage(null, 25),
      /summer-outbox-response-too-large/
    );
  });

  it('forbids redirects and sets a bounded request signal', async () => {
    const config = {
      summerOrigin: 'https://summer.example',
      outcomePrivateKey: host.privateKey,
      outcomeKeyId: 'host-outcome',
      vercelAutomationBypassSecret: 'scoped-vercel-bypass-secret',
    };
    /** @type {any} */
    let options;
    await createHttpTransport(config, async (_url, received) => {
      options = received;
      return Response.json(page([]));
    }).readPage(null, 25);
    assert.ok(options);
    assert.equal(options.redirect, 'error');
    assert.equal(options.signal instanceof AbortSignal, true);
    assert.equal(
      options.headers['x-vercel-protection-bypass'],
      'scoped-vercel-bypass-secret'
    );
  });

  it('posts the signed v3 execution outcome to the dedicated HTTP endpoint', async () => {
    const outcome = signOutcomeV3(
      taskV3(),
      executionResult(),
      host.privateKey,
      'host-outcome'
    );
    /** @type {any} */
    let request;
    const acknowledgement = {
      schema: 'summer.symphony-outcome-ack/v1',
      taskKey: outcome.taskKey,
      status: 'recorded',
    };
    const transport = createHttpTransport(
      {
        summerOrigin: 'https://summer.example',
        outcomePrivateKey: host.privateKey,
        outcomeKeyId: 'host-outcome',
      },
      async (url, options) => {
        request = { url, options };
        return Response.json(acknowledgement, { status: 201 });
      }
    );
    assert.deepEqual(await transport.writeOutcome(outcome), acknowledgement);
    assert.ok(request);
    const capturedRequest = /** @type {any} */ (request);
    assert.equal(capturedRequest.url, `https://summer.example${OUTCOME_PATH}`);
    assert.equal(capturedRequest.options.method, 'POST');
    assert.equal(
      capturedRequest.options.headers['content-type'],
      'application/json'
    );
    assert.deepEqual(JSON.parse(capturedRequest.options.body), outcome);
    assert.equal(outcome.schema, OUTCOME_DOMAIN_V3);
  });

  it('deduplicates the exact Linear projection and creates only when absent', async () => {
    const v2Task = taskV2();
    const projection = v2Task.linearProjection;
    const issue = {
      id: 'child-id',
      identifier: 'JOV-6003',
      title: projection.title,
      description: projection.description,
      createdAt: '2026-09-07T03:02:00Z',
      parent: { identifier: projection.parentIssue },
      team: { key: projection.team },
      state: { name: projection.initialState },
      labels: { nodes: [{ name: projection.labels[0] }] },
    };
    const prepared = existing => ({
      data: {
        teams: {
          nodes: [
            {
              id: 'team-id',
              key: 'JOV',
              states: { nodes: [{ id: 'todo-id', name: 'Todo' }] },
              labels: { nodes: [{ id: 'label-id', name: 'symphony' }] },
            },
          ],
        },
        parent: { id: 'parent-id', identifier: 'JOV-5853' },
        issues: { nodes: existing },
      },
    });
    const calls = [];
    const projector = createLinearProjector(
      {
        linearOrigin: 'https://api.linear.app/graphql',
        linearApiKey: 'scoped-test-key',
      },
      async (url, options) => {
        calls.push({ url, options });
        if (calls.length === 1) return Response.json(prepared([]));
        return Response.json({
          data: { issueCreate: { success: true, issue } },
        });
      }
    );
    assert.deepEqual(await projector.project(v2Task), issue);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'https://api.linear.app/graphql');
    assert.equal(calls[0].options.redirect, 'error');
    assert.equal(calls[0].options.headers.authorization, 'scoped-test-key');
    const mutation = JSON.parse(calls[1].options.body);
    assert.deepEqual(mutation.variables.input, {
      teamId: 'team-id',
      parentId: 'parent-id',
      stateId: 'todo-id',
      labelIds: ['label-id'],
      title: projection.title,
      description: projection.description,
    });

    let replayCalls = 0;
    const replayProjector = createLinearProjector(
      {
        linearOrigin: 'https://api.linear.app/graphql',
        linearApiKey: 'scoped-test-key',
      },
      async () => {
        replayCalls += 1;
        return Response.json(prepared([issue]));
      }
    );
    assert.deepEqual(await replayProjector.project(v2Task), issue);
    assert.equal(replayCalls, 1);
  });

  it('entrypoint exits with a typed configuration rejection', () => {
    const result = spawnSync(
      process.execPath,
      [
        new URL('./summer-symphony-outbox-consumer.mjs', import.meta.url)
          .pathname,
      ],
      { encoding: 'utf8', env: {} }
    );
    assert.equal(result.status, 78);
    assert.match(result.stderr, /SUMMER_SYMPHONY_CONSUMER_REJECTED/);
    assert.doesNotMatch(result.stderr, /PRIVATE KEY|LINEAR_API_KEY/u);
  });
});

function taskV3() {
  return structuredClone(existingRepairFixture.task);
}
function executionResult() {
  return structuredClone(existingRepairFixture.result);
}
describe('existing owned repair transport', () => {
  it('strictly binds signed v3 and rejects widened or native-only authority', () => {
    const value = taskV3();
    assert.deepEqual(verifyOutboxRecord(signedOutbox(value), keys), value);
    for (const mutate of [
      v => (v.existingRepair.mode = 'native'),
      v => (v.existingRepair.workspace = '/fixture/../other'),
      v => (v.existingRepair.expiresAt = '2026-09-08T01:00:00Z'),
      v => (v.linearProjection = {}),
      v => (v.decisionFingerprint = '9'.repeat(64)),
      v => (v.action = 'create-child-issue'),
    ]) {
      const changed = structuredClone(value);
      mutate(changed);
      assert.throws(() => validateTask(changed));
    }
  });
  it('keeps unqualified execution held without Linear projection or an outcome', async () => {
    let state = {
      schema: 'jovie.summer-symphony-consumer-state/v1',
      active: null,
    };
    const journal = { read: () => state, write: next => (state = next) };
    const result = await runCycle({
      journal,
      transport: {
        readPage: async () => page([signedOutbox(taskV3())]),
        writeOutcome: () => assert.fail('no outcome'),
      },
      keys,
      projector: { project: () => assert.fail('no Linear mutation') },
      outcomePrivateKey: host.privateKey,
      outcomePublicKey: host.publicKey,
      outcomeKeyId: 'host-outcome',
    });
    assert.equal(result.status, 'execution-held');
    assert.equal(state.active.phase, 'discovered');
  });
  it('durably retries the identical signed terminal outcome without a second execution', async () => {
    const root = mkdtempSync(join(tmpdir(), 'summer-v3-'));
    roots.push(root);
    const journal = createFileJournal(root, keys, host.publicKey);
    let executions = 0;
    const writes = [];
    const options = {
      journal,
      keys,
      outcomePrivateKey: host.privateKey,
      outcomePublicKey: host.publicKey,
      outcomeKeyId: 'host-outcome',
      executor: {
        execute: async () => {
          executions++;
          return executionResult();
        },
      },
      transport: {
        readPage: async () => page([signedOutbox(taskV3())]),
        writeOutcome: async outcome => {
          writes.push(outcome);
          if (writes.length === 1) throw new Error('uncertain persistence');
          return { status: 'replay' };
        },
      },
    };
    await assert.rejects(runCycle(options), /uncertain persistence/);
    assert.equal((await runCycle(options)).status, 'execution-recorded');
    assert.equal(executions, 1);
    assert.deepEqual(writes[0], writes[1]);
    assert.equal(journal.read().active, null);
  });
  it('rejects cross-bound execution, source, signature, and premature terminal records', () => {
    const value = taskV3();
    const outcome = signOutcomeV3(
      value,
      executionResult(),
      host.privateKey,
      'host-outcome'
    );
    assert.deepEqual(
      validateOutcomeV3(outcome, value, host.publicKey),
      outcome
    );
    for (const mutate of [
      v => (v.existingRepair.head = '0'.repeat(40)),
      v => (v.source.snapshotDigest = '0'.repeat(64)),
      v => (v.execution.provider = 'codex'),
      v => (v.completedAt = '2026-09-06T01:00:00Z'),
      v => (v.execution.runId = 'other'),
      v => (v.execution.taskAcceptanceDigest = '0'.repeat(64)),
    ]) {
      const changed = structuredClone(outcome);
      mutate(changed);
      assert.throws(() => validateOutcomeV3(changed, value, host.publicKey));
    }
  });
  it('uses the existing controller command and retains unsupported live execution explicitly', async () => {
    const root = mkdtempSync(
      join(tmpdir(), 'symphony-owned-repair-controller-')
    );
    roots.push(root);
    const home = join(root, 'home');
    const gem = join(root, 'gem-workspace');
    const current = join(
      home,
      '.local/bin/.symphony-codex-auth-fallback/current'
    );
    mkdirSync(join(gem, 'config'), { recursive: true });
    mkdirSync(current, { recursive: true });
    writeFileSync(
      join(gem, 'config/existing-repair-controller-manifest.json'),
      readFileSync(
        new URL(
          './config/existing-repair-controller-manifest.json',
          import.meta.url
        ),
        'utf8'
      )
    );
    for (const path of [
      join(home, '.local/bin/symphony-codex-exhausted.py'),
      join(current, 'symphony-codex-exhausted.py'),
      join(current, 'existing_pr_repair.py'),
    ]) {
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, '#!/usr/bin/env python3\n');
      chmodSync(path, 0o755);
    }
    const previousHome = process.env.HOME;
    const previousGemWorkspace = process.env.GEM_WORKSPACE;
    process.env.HOME = home;
    process.env.GEM_WORKSPACE = gem;
    let calls = 0;
    try {
      const executor = createOwnedRepairExecutor({
        run: (binary, args, options) => {
          calls++;
          assert.match(binary, /\.local\/bin\/symphony-codex-exhausted\.py$/);
          assert.deepEqual(args, ['owned-repair']);
          assert.deepEqual(JSON.parse(options.input), taskV3());
          return {
            status: 0,
            stdout: JSON.stringify({
              status: 'held',
              reason: 'qualified-isolated-repair-executor-unavailable',
            }),
          };
        },
      });
      assert.equal((await executor.execute(taskV3())).status, 'held');
      assert.equal(calls, 1);

      const child = /** @type {import('node:events').EventEmitter & {
        stdout: import('node:events').EventEmitter,
        stderr: import('node:events').EventEmitter,
        stdin: { end(input: string): void },
        kill(signal?: string): void
      }} */ (/** @type {unknown} */ (new EventEmitter()));
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = {
        end(input) {
          assert.deepEqual(JSON.parse(input), taskV3());
          queueMicrotask(() => {
            child.stdout.emit(
              'data',
              JSON.stringify({
                status: 'held',
                reason: 'qualified-isolated-repair-executor-unavailable',
              })
            );
            child.emit('close', 0, null);
          });
        },
      };
      child.kill = signal => assert.equal(signal, 'SIGTERM');
      const asyncExecutor = createOwnedRepairExecutor({
        spawnProcess: (binary, args, options) => {
          assert.match(binary, /\.local\/bin\/symphony-codex-exhausted\.py$/);
          assert.deepEqual(args, ['owned-repair']);
          assert.deepEqual(options.stdio, ['pipe', 'pipe', 'pipe']);
          return child;
        },
      });
      assert.equal((await asyncExecutor.execute(taskV3())).status, 'held');
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      if (previousGemWorkspace === undefined) delete process.env.GEM_WORKSPACE;
      else process.env.GEM_WORKSPACE = previousGemWorkspace;
    }
  });
  it('rejects terminal evidence that is cross-bound, head-frozen on success, or wrongly signed', () => {
    const value = taskV3();
    const outcome = signOutcomeV3(
      value,
      executionResult(),
      host.privateKey,
      'host-outcome'
    );
    assert.deepEqual(
      validateOutcomeV3(outcome, value, host.publicKey),
      outcome
    );
    for (const mutate of [
      v => (v.execution.verification.claimRecorded = false),
      v => (v.execution.baseHead = '0'.repeat(40)),
      v => (v.execution.finalHead = v.execution.baseHead),
    ]) {
      const changed = structuredClone(outcome);
      mutate(changed);
      assert.throws(
        () => validateExecutionEvidenceV3(changed),
        /consumer-execution-evidence-(invalid-or-cross-bound|success-without-head-change)/
      );
    }
    const reworded = structuredClone(outcome);
    reworded.detail = 'tampered detail';
    assert.throws(
      () => validateOutcomeV3(reworded, value, host.publicKey),
      /consumer-execution-outcome-signature-invalid/
    );
  });
  it('holds when the controller package is missing or malformed and rejects process failures', async () => {
    const root = mkdtempSync(join(tmpdir(), 'symphony-owned-repair-hold-'));
    roots.push(root);
    const previousHome = process.env.HOME;
    const previousGemWorkspace = process.env.GEM_WORKSPACE;
    const home = join(root, 'home');
    const gem = join(root, 'gem-workspace');
    const current = join(
      home,
      '.local/bin/.symphony-codex-auth-fallback/current'
    );
    mkdirSync(join(gem, 'config'), { recursive: true });
    process.env.HOME = home;
    process.env.GEM_WORKSPACE = gem;
    const held = {
      status: 'held',
      reason: 'qualified-isolated-repair-executor-unavailable',
    };
    try {
      // No manifest at all -> package unavailable, the cycle holds.
      const missingManifest = createOwnedRepairExecutor();
      assert.deepEqual(await missingManifest.execute(taskV3()), held);
      // Malformed manifest -> invalid package, still held (never executed).
      const manifest = JSON.parse(
        readFileSync(
          new URL(
            './config/existing-repair-controller-manifest.json',
            import.meta.url
          ),
          'utf8'
        )
      );
      writeFileSync(
        join(gem, 'config/existing-repair-controller-manifest.json'),
        JSON.stringify({ ...manifest, packageId: 'not-the-published-package' })
      );
      assert.deepEqual(
        await createOwnedRepairExecutor().execute(taskV3()),
        held
      );
      // Path-escape manifest -> path-invalid, still held.
      writeFileSync(
        join(gem, 'config/existing-repair-controller-manifest.json'),
        JSON.stringify({
          ...manifest,
          launcherRelativePath: '../escape/symphony-codex-exhausted.py',
        })
      );
      assert.deepEqual(
        await createOwnedRepairExecutor().execute(taskV3()),
        held
      );
      // Valid manifest but no launcher on disk -> unavailable, still held.
      writeFileSync(
        join(gem, 'config/existing-repair-controller-manifest.json'),
        JSON.stringify(manifest)
      );
      assert.deepEqual(
        await createOwnedRepairExecutor().execute(taskV3()),
        held
      );
      // With the launcher present, process-level failures reject loudly.
      mkdirSync(current, { recursive: true });
      for (const path of [
        join(home, '.local/bin/symphony-codex-exhausted.py'),
        join(current, 'symphony-codex-exhausted.py'),
        join(current, 'existing_pr_repair.py'),
      ]) {
        writeFileSync(path, '#!/usr/bin/env python3\n');
        chmodSync(path, 0o755);
      }
      const failingExecutor = createOwnedRepairExecutor({
        run: () => ({ status: 3, stdout: '' }),
      });
      await assert.rejects(
        failingExecutor.execute(taskV3()),
        /existing-repair-controller-unavailable/
      );
      const invalidJsonExecutor = createOwnedRepairExecutor({
        run: () => ({ status: 0, stdout: 'not-json' }),
      });
      await assert.rejects(
        invalidJsonExecutor.execute(taskV3()),
        /"not-json" is not valid JSON/
      );
      const streamErrorExecutor = createOwnedRepairExecutor({
        run: () => ({
          status: null,
          stdout: '',
          error: new Error('spawn boom'),
        }),
      });
      await assert.rejects(
        streamErrorExecutor.execute(taskV3()),
        /existing-repair-controller-unavailable/
      );
      const oversizedExecutor = createOwnedRepairExecutor({
        run: () => ({
          status: 0,
          stdout: 'x'.repeat(128 * 1024 + 1),
        }),
      });
      await assert.rejects(
        oversizedExecutor.execute(taskV3()),
        /is not valid JSON/
      );
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      if (previousGemWorkspace === undefined) delete process.env.GEM_WORKSPACE;
      else process.env.GEM_WORKSPACE = previousGemWorkspace;
    }
  });
  it('bounds controller output and rejects failed, invalid, or unreadable controller streams', async () => {
    const root = mkdtempSync(join(tmpdir(), 'symphony-owned-repair-streams-'));
    roots.push(root);
    const home = join(root, 'home');
    const gem = join(root, 'gem-workspace');
    const current = join(
      home,
      '.local/bin/.symphony-codex-auth-fallback/current'
    );
    mkdirSync(join(gem, 'config'), { recursive: true });
    mkdirSync(current, { recursive: true });
    writeFileSync(
      join(gem, 'config/existing-repair-controller-manifest.json'),
      readFileSync(
        new URL(
          './config/existing-repair-controller-manifest.json',
          import.meta.url
        ),
        'utf8'
      )
    );
    for (const path of [
      join(home, '.local/bin/symphony-codex-exhausted.py'),
      join(current, 'symphony-codex-exhausted.py'),
      join(current, 'existing_pr_repair.py'),
    ]) {
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, '#!/usr/bin/env python3\n');
      chmodSync(path, 0o755);
    }
    const previousHome = process.env.HOME;
    const previousGemWorkspace = process.env.GEM_WORKSPACE;
    process.env.HOME = home;
    process.env.GEM_WORKSPACE = gem;
    try {
      const fakeChild = () => {
        const child = /** @type {import('node:events').EventEmitter & {
          stdout: import('node:events').EventEmitter,
          stderr: import('node:events').EventEmitter,
          stdin: { end(input: string): void },
          kill(signal?: string): void
        }} */ (/** @type {unknown} */ (new EventEmitter()));
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.kill = signal => assert.equal(signal, 'SIGTERM');
        return child;
      };
      // stderr output is drained (append else-branch) and a nonzero close
      // rejects as unavailable.
      const failedChild = fakeChild();
      failedChild.stdin = {
        end() {
          queueMicrotask(() => {
            failedChild.stderr.emit('data', 'controller boomed');
            failedChild.emit('close', 3, null);
          });
        },
      };
      await assert.rejects(
        createOwnedRepairExecutor({
          spawnProcess: () => failedChild,
        }).execute(taskV3()),
        /existing-repair-controller-unavailable/
      );
      // A close with a signal is equally unavailable.
      const signaledChild = fakeChild();
      signaledChild.stdin = {
        end() {
          queueMicrotask(() => signaledChild.emit('close', null, 'SIGKILL'));
        },
      };
      await assert.rejects(
        createOwnedRepairExecutor({
          spawnProcess: () => signaledChild,
        }).execute(taskV3()),
        /existing-repair-controller-unavailable/
      );
      // Clean close with non-JSON stdout -> invalid JSON.
      const invalidJsonChild = fakeChild();
      invalidJsonChild.stdin = {
        end() {
          queueMicrotask(() => {
            invalidJsonChild.stdout.emit('data', 'not-json');
            invalidJsonChild.emit('close', 0, null);
          });
        },
      };
      await assert.rejects(
        createOwnedRepairExecutor({
          spawnProcess: () => invalidJsonChild,
        }).execute(taskV3()),
        /existing-repair-controller-invalid-json/
      );
      // Output beyond the bounded buffer is killed, never trusted.
      const oversizedChild = fakeChild();
      oversizedChild.stdin = {
        end() {
          queueMicrotask(() => {
            oversizedChild.stdout.emit(
              'data',
              Buffer.alloc(128 * 1024 + 1, 'x')
            );
          });
        },
      };
      await assert.rejects(
        createOwnedRepairExecutor({
          spawnProcess: () => oversizedChild,
        }).execute(taskV3()),
        /existing-repair-controller-output-too-large/
      );
      // A stdin write failure finishes with the write error.
      const brokenStdinChild = fakeChild();
      brokenStdinChild.stdin = {
        end() {
          throw new Error('stdin pipe broken');
        },
      };
      await assert.rejects(
        createOwnedRepairExecutor({
          spawnProcess: () => brokenStdinChild,
        }).execute(taskV3()),
        /stdin pipe broken/
      );
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      if (previousGemWorkspace === undefined) delete process.env.GEM_WORKSPACE;
      else process.env.GEM_WORKSPACE = previousGemWorkspace;
    }
  });
});
