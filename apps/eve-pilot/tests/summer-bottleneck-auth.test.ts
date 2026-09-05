import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { signSummerBottleneckSnapshot } from '../../../packages/agent-transport-contracts/index';
import {
  handleSummerBottleneckRequest,
  JOVIE_PRODUCTION_OIDC_SUBJECT,
  ovieSummerBottleneckOidcAuth,
  readBoundedSummerBottleneckJson,
} from '../agent/channels/summer-bottleneck';
import type {
  SummerBottleneckDependencies,
  SummerBottleneckRecord,
} from '../agent/lib/summer-bottleneck-loop';
import {
  signSummerBottleneckProducerAttestation,
  summerBottleneckSnapshotSchema,
  verifySummerBottleneckProducerAttestation,
} from '../agent/lib/summer-bottleneck-loop';

const SOURCE = 'a'.repeat(40);
const NOW = '2026-09-02T08:00:00.000Z';
const producerKeys = generateKeyPairSync('ed25519');
const PRODUCER_PRIVATE_KEY = producerKeys.privateKey
  .export({
    format: 'pem',
    type: 'pkcs8',
  })
  .toString();
const PRODUCER_PUBLIC_KEY = producerKeys.publicKey
  .export({
    format: 'pem',
    type: 'spki',
  })
  .toString();
const PRODUCER_KEY_ID = 'jovie-production-2026-09';

function validSnapshot() {
  const source = (digit: string) => ({
    observedAt: NOW,
    sourceDigest: digit.repeat(64),
    sourceRevision: SOURCE,
  });
  const body = {
    schema: 'jovie.eve.summer-bottleneck-snapshot/v1',
    eventId: 'evt_channel_0001',
    observedAt: NOW,
    sourceVersion: SOURCE,
    signals: {
      closure: {
        schema: 'jovie.eve.summer-closure-projection/v1',
        sourceSchema: 'jovie-closure-health/v1',
        ...source('1'),
        status: 'healthy',
        blockedSince: null,
        openPullRequests: 1,
      },
      queue: {
        schema: 'jovie.eve.summer-queue-projection/v1',
        sourceSchema: 'github-merge-queue-entry/v1',
        ...source('2'),
        blockedSince: null,
        eligibleCleanPrs: 0,
        queuedPrs: 0,
      },
      release: {
        schema: 'jovie.eve.summer-release-projection/v1',
        sourceSchema: 'jovie-controller-snapshot/v1',
        ...source('3'),
        blockedSince: null,
        mainSha: SOURCE,
        productionSha: SOURCE,
        unverifiedMerges: 0,
      },
      runner: {
        schema: 'jovie.eve.summer-runner-projection/v1',
        sourceSchema: 'symphony-lease-guard-report/v1',
        ...source('4'),
        blockedSince: null,
        capacityAvailable: 1,
        queuedWork: 0,
      },
      ciAudit: {
        schema: 'jovie-ci-bottleneck-audit/v1',
        ...source('5'),
        classes: [
          'merge-group-flake-baseline-ratchet',
          'controller-cascade-coalescing',
          'auto-enroll-self-cancel-churn',
          'controller-check-run-pagination-cap',
          'obsolete-unaffected-native-lanes',
          'affected-only-unit-selection',
        ].map((id, index) => ({
          id,
          state: 'implemented',
          blockedSince: NOW,
          impact: index + 1,
          owner: 'ci-owner',
          handle: `audit:${index}`,
        })),
      },
    },
  };
  return {
    ...body,
    producerAttestation: signSummerBottleneckProducerAttestation(
      body,
      PRODUCER_PRIVATE_KEY,
      PRODUCER_KEY_ID
    ),
  };
}

function runtime(): SummerBottleneckDependencies {
  const records = new Map<string, SummerBottleneckRecord>();
  return {
    dispatchToSymphony: vi.fn(),
    now: () => new Date(NOW),
    observeSymphonyOutcome: vi.fn(),
    receiptSigningKey: 'r'.repeat(64),
    receiptSigningKeyId: 'eve-receipts-2026-09',
    producerVerificationKeys: new Map([[PRODUCER_KEY_ID, PRODUCER_PUBLIC_KEY]]),
    store: {
      async create(pathname, record) {
        if (records.has(pathname)) return 'exists';
        records.set(pathname, record);
        return 'created';
      },
      async read(pathname) {
        return records.get(pathname) ?? null;
      },
      async list() {
        return { entries: [], hasMore: false, scanned: 0 };
      },
      async write(pathname, record) {
        records.set(pathname, record);
      },
    },
  };
}

describe('Summer bottleneck OIDC boundary', () => {
  it('accepts the Jovie producer attestation without contract translation', () => {
    const { producerAttestation: _ignored, ...unsigned } = validSnapshot();
    const signed = signSummerBottleneckSnapshot(
      unsigned,
      PRODUCER_PRIVATE_KEY,
      PRODUCER_KEY_ID
    );
    const parsed = summerBottleneckSnapshotSchema.parse(signed);

    expect(
      verifySummerBottleneckProducerAttestation(
        parsed,
        new Map([[PRODUCER_KEY_ID, PRODUCER_PUBLIC_KEY]])
      )
    ).toBe(true);
  });

  it('pins the only accepted external subject to Jovie production', () => {
    expect(JOVIE_PRODUCTION_OIDC_SUBJECT).toBe(
      'owner:jovie:project:jovie:environment:production'
    );
  });

  it('rejects an unsigned request', async () => {
    await expect(
      ovieSummerBottleneckOidcAuth(
        new Request('https://eve.example.com/ovie/v1/summer-bottleneck/events')
      )
    ).resolves.toBeNull();
  });

  it('reads a streamed JSON body within the fixed byte limit', async () => {
    const encoder = new TextEncoder();
    const request = new Request('https://eve.example.com/events', {
      method: 'POST',
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('{"eventId":'));
          controller.enqueue(encoder.encode('"evt_0001"}'));
          controller.close();
        },
      }),
      duplex: 'half',
    } as RequestInit);

    await expect(readBoundedSummerBottleneckJson(request)).resolves.toEqual({
      eventId: 'evt_0001',
    });
  });

  it('rejects declared or streamed bodies above the byte limit', async () => {
    const declared = new Request('https://eve.example.com/events', {
      method: 'POST',
      headers: { 'content-length': String(65 * 1024) },
      body: '{}',
    });
    await expect(readBoundedSummerBottleneckJson(declared)).rejects.toThrow(
      'body-too-large'
    );

    const streamed = new Request('https://eve.example.com/events', {
      method: 'POST',
      body: new Uint8Array(65 * 1024),
    });
    await expect(readBoundedSummerBottleneckJson(streamed)).rejects.toThrow(
      'body-too-large'
    );
  });

  it('preserves authentication responses before reading the request body', async () => {
    const refused = Response.json({ ok: false }, { status: 401 });
    const response = await handleSummerBottleneckRequest(
      new Request('https://eve.example.com/events', { method: 'POST' }),
      {
        authenticate: vi.fn(async () => refused),
        createRuntime: vi.fn(() => {
          throw new Error('must not run');
        }),
        requireDispatchAuthority: vi.fn(),
      }
    );
    expect(response).toBe(refused);
  });

  it.each([
    ['invalid_json', '{bad-json', 400],
    ['invalid_bottleneck_snapshot', '{}', 422],
  ])('returns %s for malformed ingress', async (code, body, status) => {
    const response = await handleSummerBottleneckRequest(
      new Request('https://eve.example.com/events', { method: 'POST', body }),
      {
        authenticate: vi.fn(async () => ({})),
        createRuntime: vi.fn(() => {
          throw new Error('must not run');
        }),
        requireDispatchAuthority: vi.fn(),
      }
    );
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ code });
  });

  it('reports the intentionally uncommissioned signed runtime', async () => {
    const response = await handleSummerBottleneckRequest(
      new Request('https://eve.example.com/events', {
        method: 'POST',
        body: JSON.stringify(validSnapshot()),
      }),
      {
        authenticate: vi.fn(async () => ({})),
        createRuntime: vi.fn(() => {
          throw new Error('signing authority not commissioned');
        }),
        requireDispatchAuthority: vi.fn(),
      }
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: 'bottleneck_runtime_unavailable',
    });
  });

  it('maps accepted and duplicate events to 202 and 409', async () => {
    const proof = runtime();
    const requireDispatchAuthority = vi.fn();
    const request = () =>
      new Request('https://eve.example.com/events', {
        method: 'POST',
        body: JSON.stringify(validSnapshot()),
      });
    const dependencies = {
      authenticate: vi.fn(async () => ({})),
      createRuntime: () => proof,
      requireDispatchAuthority,
    };

    expect(
      (await handleSummerBottleneckRequest(request(), dependencies)).status
    ).toBe(202);
    expect(
      (await handleSummerBottleneckRequest(request(), dependencies)).status
    ).toBe(409);
    expect(requireDispatchAuthority).toHaveBeenCalledTimes(2);
  });

  it('maps durable processing failures to a retryable 503', async () => {
    const proof = runtime();
    proof.store.create = vi.fn(async () => {
      throw new Error('store unavailable');
    });
    const response = await handleSummerBottleneckRequest(
      new Request('https://eve.example.com/events', {
        method: 'POST',
        body: JSON.stringify(validSnapshot()),
      }),
      {
        authenticate: vi.fn(async () => ({})),
        createRuntime: () => proof,
        requireDispatchAuthority: vi.fn(),
      }
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: 'bottleneck_processing_failed',
    });
  });
});
