import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, it } from 'node:test';

import {
  canonical,
  createHttpTransport,
  discoverOne,
  OUTBOX_DOMAIN,
  OUTBOX_DOMAIN_V2,
  PAGE_SCHEMA,
  parseVerificationKeys,
  runCycle,
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
const foreign = pair();
const taskKey = 'a'.repeat(64);
const keys = new Map([['summer-outbox', summer.publicKey]]);

function taskV2(overrides = {}) {
  const selected = {
    id: 'affected-only-unit-selection',
    sourceRevision: 'b'.repeat(40),
    sourceDigest: 'c'.repeat(64),
    owner: 'ci-reliability',
    handle: 'audit:affected-only',
  };
  const source = {
    sourceVersion: 'b'.repeat(40),
    snapshotDigest: 'd'.repeat(64),
  };
  return {
    schema: 'jovie-symphony-repair-task/v2',
    taskKey,
    decisionFingerprint: taskKey,
    createdAt: '2026-09-07T01:00:00Z',
    owner: 'symphony',
    route: 'symphony',
    authority: 'linear-child-projection-only',
    action: 'remediate-selected-ci-audit-class',
    safety: 'exact-source-ci-native-queue-production-gates-remain-required',
    selected,
    source,
    linearProjection: {
      mutation: 'create-child-issue',
      team: 'JOV',
      parentIssue: 'JOV-5853',
      title: `[summer-task:${taskKey}] ${selected.id}`,
      description: `[summer-task:${taskKey}]\n\nSelected: ${selected.id}\nAction: remediate-selected-ci-audit-class\nSource: ${source.sourceVersion}`,
      initialState: 'Todo',
      labels: ['symphony'],
    },
    ...overrides,
  };
}

function signedOutbox(
  task = taskV2(),
  signing = summer,
  keyId = 'summer-outbox'
) {
  const domain =
    task.schema === 'jovie-symphony-repair-task/v2'
      ? OUTBOX_DOMAIN_V2
      : OUTBOX_DOMAIN;
  const unsigned = {
    schema: domain,
    destination: 'symphony',
    idempotencyKey: task.taskKey,
    status: 'ready',
    task,
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

describe('Summer Symphony consumer contract foundation', () => {
  it('accepts only the exact signed v2 projection authority', () => {
    const record = signedOutbox();
    assert.equal(verifyOutboxRecord(record, keys).taskKey, taskKey);
    assert.throws(
      () =>
        verifyOutboxRecord(
          signedOutbox(
            taskV2({
              linearProjection: {
                ...taskV2().linearProjection,
                parentIssue: 'JOV-6001',
              },
            })
          ),
          keys
        ),
      /projection-cross-bound/
    );
    assert.throws(
      () =>
        verifyOutboxRecord(signedOutbox(taskV2(), foreign, 'foreign'), keys),
      /outbox-signing-key-unknown/
    );
  });

  it('rejects old wire and non-Ed25519 verification material', () => {
    assert.throws(
      () =>
        verifyOutboxRecord(
          { ...signedOutbox(), schema: 'jovie.eve.symphony-repair-outbox/v0' },
          keys
        ),
      /outbox-record-invalid/
    );
    const p256 = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    assert.throws(
      () =>
        parseVerificationKeys(
          JSON.stringify({
            wrong: p256.publicKey
              .export({ type: 'spki', format: 'pem' })
              .toString(),
          })
        ),
      /verification-keys-invalid/
    );
  });

  it('keeps each discovery call bounded while returning its safe resume cursor', async () => {
    let cursor = 0;
    await assert.rejects(
      discoverOne(
        {
          readPage: async () => ({
            schema: PAGE_SCHEMA,
            records: [],
            cursor: String(++cursor),
            hasMore: true,
            scanned: 25,
          }),
        },
        keys
      ),
      error =>
        error instanceof Error &&
        error.message === 'outbox-page-limit-exceeded' &&
        'nextCursor' in error &&
        error.nextCursor === '4'
    );
  });

  it('sends the Vercel protection bypass only as a request header', async () => {
    const requests = [];
    const transport = createHttpTransport(
      {
        summerOrigin: 'https://summer.example',
        outcomePrivateKey: summer.privateKey,
        outcomeKeyId: 'host-outcome',
        vercelAutomationBypassSecret: 'scoped-bypass-secret',
      },
      async (url, options) => {
        requests.push({ url, options });
        if (options.method === 'POST') {
          return Response.json({
            schema: 'summer.symphony-outcome-ack/v1',
            taskKey,
            status: 'recorded',
          });
        }
        return Response.json({
          schema: PAGE_SCHEMA,
          records: [],
          cursor: null,
          hasMore: false,
          scanned: 0,
        });
      }
    );
    await transport.readPage(null, 25);
    await transport.writeOutcome({ taskKey });
    assert.equal(requests.length, 2);
    for (const request of requests) {
      assert.equal(
        request.options.headers['x-vercel-protection-bypass'],
        'scoped-bypass-secret'
      );
      assert.equal(request.url.includes('scoped-bypass-secret'), false);
    }
    assert.equal(requests[0].options.method, undefined);
    assert.equal(requests[1].options.method, 'POST');
  });

  it('journals one projection and replays the exact outcome after restart', async () => {
    const task = taskV2();
    let state = {
      schema: 'jovie.summer-symphony-consumer-state/v1',
      active: null,
    };
    let projections = 0;
    const posts = [];
    const options = {
      journal: {
        read: () => state,
        write: next => {
          state = structuredClone(next);
        },
      },
      keys,
      transport: {
        readPage: async () => ({
          schema: PAGE_SCHEMA,
          records: [signedOutbox(task)],
          cursor: null,
          hasMore: false,
          scanned: 1,
        }),
        writeOutcome: async outcome => {
          posts.push(canonical(outcome));
          if (posts.length === 1) throw new Error('ambiguous-network');
          return {
            schema: 'summer.symphony-outcome-ack/v1',
            taskKey,
            status: 'replay',
          };
        },
      },
      projector: {
        project: async current => {
          projections += 1;
          return {
            identifier: 'JOV-6001',
            createdAt: '2026-09-07T03:00:00Z',
            ...current.linearProjection,
          };
        },
      },
      outcomePrivateKey: foreign.privateKey,
      outcomePublicKey: foreign.publicKey,
      outcomeKeyId: 'host-outcome',
    };
    await assert.rejects(runCycle(options), /ambiguous-network/);
    assert.equal(state.active.phase, 'outcome-pending');
    await runCycle(options);
    assert.equal(projections, 1);
    assert.equal(posts[1], posts[0]);
    assert.equal(state.active, null);
  });
});
