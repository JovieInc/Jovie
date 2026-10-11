import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyCronRequestMock, ingestMock } = vi.hoisted(() => ({
  verifyCronRequestMock: vi.fn(),
  ingestMock: vi.fn(),
}));

vi.mock('@/lib/cron/auth', () => ({
  verifyCronRequest: verifyCronRequestMock,
}));
vi.mock('@/lib/agent-os/certification-runtime-store', () => ({
  ingestMarketingCertificationPacket: ingestMock,
}));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));

import {
  MarketingCertificationPersistenceError,
  MarketingCertificationRegistryDriftError,
} from '@/lib/agent-os/certification-adapter';
import { POST } from './route';

const SHA = 'a'.repeat(40);

function packet(overrides: Record<string, unknown> = {}) {
  return {
    contract: 'jovie.certification/v1',
    subject: { id: 'marketing.hero', kind: 'marketing-section', title: 'Hero' },
    source: {
      repository: 'JovieInc/Jovie',
      ref: 'main',
      sha: SHA,
      paths: ['a.tsx'],
    },
    canonicalReferences: [],
    invariantEvaluation: [
      {
        id: 'inv-1',
        tier: 'invariant_evaluation',
        status: 'passed',
        sourceSha: SHA,
        ref: 'ci',
        digest: null,
        summary: 'ok',
      },
    ],
    testsCoverage: [],
    visualProof: [],
    requiredVariants: [],
    itemMedia: [],
    ...overrides,
  };
}

function post(body: unknown) {
  return POST(
    new Request('https://jov.ie/api/internal/ovie/certification-evidence', {
      method: 'POST',
      headers: { authorization: 'Bearer secret' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );
}

const EVALUATED_AT = '2026-09-27T23:00:00.000Z';

describe('POST /api/internal/ovie/certification-evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyCronRequestMock.mockReturnValue(null);
    ingestMock.mockResolvedValue({ id: 'marketing.hero', state: 'working' });
  });

  it('rejects unauthenticated callers before reading the body', async () => {
    verifyCronRequestMock.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );
    const response = await post({
      evaluatedAt: EVALUATED_AT,
      packet: packet(),
    });
    expect(response.status).toBe(401);
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it('ingests a valid packet at the stated evaluation time', async () => {
    const response = await post({
      evaluatedAt: EVALUATED_AT,
      packet: packet(),
    });
    expect(response.status).toBe(200);
    expect(ingestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.objectContaining({ id: 'marketing.hero' }),
      }),
      EVALUATED_AT
    );
  });

  it.each([
    ['unknown fields', packet({ founderDecision: 'approved' })],
    [
      'a foreign repository',
      packet({
        source: { repository: 'evil/repo', ref: 'main', sha: SHA, paths: [] },
      }),
    ],
    [
      'a short sha',
      packet({
        source: {
          repository: 'JovieInc/Jovie',
          ref: 'main',
          sha: 'abc',
          paths: [],
        },
      }),
    ],
    [
      'an unknown tier',
      packet({
        testsCoverage: [{ ...packet().invariantEvaluation[0], tier: 'vibes' }],
      }),
    ],
  ])('rejects %s without touching the ledger', async (_label, bad) => {
    const response = await post({ evaluatedAt: EVALUATED_AT, packet: bad });
    expect(response.status).toBe(400);
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it('rejects oversized and malformed bodies', async () => {
    expect((await post('x'.repeat(65 * 1024))).status).toBe(413);
    expect((await post('{not json')).status).toBe(400);
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it('maps store rejections to 422 and unexpected failures to 503', async () => {
    ingestMock.mockRejectedValueOnce(
      new MarketingCertificationRegistryDriftError('nope')
    );
    expect(
      (await post({ evaluatedAt: EVALUATED_AT, packet: packet() })).status
    ).toBe(422);
    ingestMock.mockRejectedValueOnce(
      new MarketingCertificationPersistenceError('not newer')
    );
    expect(
      (await post({ evaluatedAt: EVALUATED_AT, packet: packet() })).status
    ).toBe(422);
    ingestMock.mockRejectedValueOnce(new Error('db down'));
    expect(
      (await post({ evaluatedAt: EVALUATED_AT, packet: packet() })).status
    ).toBe(503);
  });
});
