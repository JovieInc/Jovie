import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getVercelOidcToken: vi.fn(),
  verifyCronRequest: vi.fn(),
}));

vi.mock('@vercel/oidc', () => ({
  getVercelOidcToken: mocks.getVercelOidcToken,
}));

vi.mock('@/lib/cron/auth', () => ({
  verifyCronRequest: mocks.verifyCronRequest,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn() },
}));

import { SUMMER_PRODUCTION } from '@/lib/ovie/summer-production-identity';
import { resetSummerProductionPinCache } from '@/lib/ovie/summer-production-pin';
import { POST } from './route';

const NOW = '2026-09-04T20:00:00.000Z';
const SOURCE = 'a'.repeat(40);
const ORIGIN = 'https://jovie-eve-shadow-abc123-jovie.vercel.app';
const PINNED = 'dpl_pinned';
const producerKeys = generateKeyPairSync('ed25519');
const PRODUCER_PRIVATE_KEY = producerKeys.privateKey
  .export({ format: 'pem', type: 'pkcs8' })
  .toString();
const PRODUCER_KEY_ID = 'jovie-production-2026-09';

function oidcToken(): string {
  return `${Buffer.from('{}').toString('base64url')}.${Buffer.from(
    JSON.stringify({
      iss: 'https://oidc.vercel.com/jovie',
      sub: 'owner:jovie:project:jovie:environment:production',
    })
  ).toString('base64url')}.signature`;
}

function validSnapshot() {
  const source = (digit: string) => ({
    observedAt: NOW,
    sourceDigest: digit.repeat(64),
    sourceRevision: SOURCE,
  });
  return {
    schema: 'jovie.eve.summer-bottleneck-snapshot/v1',
    eventId: 'evt_producer_bridge_0001',
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
        sourceSchema: 'symphony-runner-projection/v1',
        ...source('4'),
        blockedSince: null,
        capacitySource: {
          schema: 'symphony-lease-guard-report/v1',
          ...source('6'),
        },
        workSource: {
          schema: 'symphony-runtime-state/v1',
          ...source('7'),
        },
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
}

function request(body: unknown) {
  return new Request('https://jov.ie/api/internal/ovie/summer-bottleneck', {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-cron-secret',
      'content-type': 'application/json',
      'x-forwarded-host': 'jov.ie',
    },
    body: JSON.stringify(body),
  });
}

function runtimeIdentity(overrides: Record<string, unknown> = {}) {
  return {
    id: SUMMER_PRODUCTION.serviceId,
    projectId: SUMMER_PRODUCTION.projectId,
    environment: 'production',
    deploymentId: PINNED,
    blobAuth: 'oidc',
    ...overrides,
  };
}

function installFetch(identity: () => Response) {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/runtime/v1/identity')) return identity();
    return Response.json(
      {
        ok: true,
        receipt: {
          eventId: validSnapshot().eventId,
          decision: 'accepted',
        },
      },
      { status: 202 }
    );
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('POST /api/internal/ovie/summer-bottleneck pin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSummerProductionPinCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', SOURCE);
    vi.stubEnv('OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN', ORIGIN);
    vi.stubEnv('OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID', PINNED);
    vi.stubEnv(
      'SUMMER_BOTTLENECK_PRODUCER_SIGNING_PRIVATE_KEY',
      PRODUCER_PRIVATE_KEY
    );
    vi.stubEnv('SUMMER_BOTTLENECK_PRODUCER_SIGNING_KEY_ID', PRODUCER_KEY_ID);
    mocks.verifyCronRequest.mockReturnValue(null);
    mocks.getVercelOidcToken.mockResolvedValue(oidcToken());
  });

  afterEach(() => {
    resetSummerProductionPinCache();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns 503 summer_pin_invalid when the alias project mismatches', async () => {
    const fetch = installFetch(() =>
      Response.json(runtimeIdentity({ projectId: 'prj_other' }))
    );
    const response = await POST(request(validSnapshot()));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: 'summer_pin_invalid',
    });
    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      'https://summer.jov.ie/runtime/v1/identity'
    );
    expect(
      fetch.mock.calls.some(call =>
        String(call[0]).includes('summer-bottleneck')
      )
    ).toBe(false);
    expect(mocks.getVercelOidcToken).not.toHaveBeenCalled();
  });

  it('returns 503 summer_pin_invalid when alias identity is 404', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetch = installFetch(() => new Response(null, { status: 404 }));
    const response = await POST(request(validSnapshot()));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: 'summer_pin_invalid',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const logged = errorSpy.mock.calls[0]?.[0] as {
      event?: string;
      observed?: { status?: number };
    };
    expect(logged.event).toBe('summer_pin_invalid');
    expect(logged.observed?.status).toBe(404);
  });

  it('delivers to the alias when the pinned identity matches', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetch = installFetch(() => Response.json(runtimeIdentity()));
    const response = await POST(request(validSnapshot()));
    expect(response.status).toBe(202);
    expect(fetch.mock.calls.map(call => String(call[0]))).toEqual([
      'https://summer.jov.ie/runtime/v1/identity',
      'https://summer.jov.ie/ovie/v1/summer-bottleneck/events',
    ]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('delivers to the alias and logs when the pinned deployment is stale', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetch = installFetch(() =>
      Response.json(runtimeIdentity({ deploymentId: 'dpl_promoted' }))
    );
    const response = await POST(request(validSnapshot()));
    expect(response.status).toBe(202);
    expect(String(fetch.mock.calls[1]?.[0])).toBe(
      'https://summer.jov.ie/ovie/v1/summer-bottleneck/events'
    );
    expect(String(fetch.mock.calls[0]?.[0])).not.toContain(ORIGIN.slice(8));
    const logged = errorSpy.mock.calls[0]?.[0] as {
      event?: string;
      observed?: { fallback?: string };
    };
    expect(logged.event).toBe('summer_pin_invalid');
    expect(logged.observed?.fallback).toBe('production_alias');
  });

  it('delivers to the alias without a pin log when no pin is configured', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN', '');
    vi.stubEnv('OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID', '');
    const fetch = installFetch(() =>
      Response.json(runtimeIdentity({ deploymentId: 'dpl_promoted' }))
    );
    const response = await POST(request(validSnapshot()));
    expect(response.status).toBe(202);
    expect(String(fetch.mock.calls[1]?.[0])).toBe(
      'https://summer.jov.ie/ovie/v1/summer-bottleneck/events'
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
