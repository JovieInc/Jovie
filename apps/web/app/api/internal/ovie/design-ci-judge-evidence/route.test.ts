import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyCronRequestMock, upsertMock } = vi.hoisted(() => ({
  verifyCronRequestMock: vi.fn(),
  upsertMock: vi.fn(),
}));

vi.mock('@/lib/cron/auth', () => ({
  verifyCronRequest: verifyCronRequestMock,
}));
vi.mock('@/lib/agent-os/design-ci-judge-runtime-store', () => ({
  upsertDesignCiJudgeCells: upsertMock,
}));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));

import { DesignCiJudgeCertificationPersistenceError } from '@/lib/agent-os/design-ci-judge-certification';
import { POST } from './route';

const FINGERPRINT = `sha256:${'a'.repeat(64)}`;

function cell(overrides: Record<string, unknown> = {}) {
  return {
    cellId: 'JOV-INV-039::screen:web.homepage',
    rowId: 'JOV-INV-039',
    unitId: 'screen:web.homepage',
    route: 'deterministic',
    state: 'insufficient',
    evidence: ['scripts/invariants/overlay-layer-contract.mjs'],
    artifactHash: FINGERPRINT,
    rubricFingerprint: FINGERPRINT,
    inputFingerprint: FINGERPRINT,
    ...overrides,
  };
}

function post(body: unknown) {
  return POST(
    new Request('https://jov.ie/api/internal/ovie/design-ci-judge-evidence', {
      method: 'POST',
      headers: { authorization: 'Bearer secret' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );
}

const EVALUATED_AT = '2026-09-29T00:00:00.000Z';

describe('POST /api/internal/ovie/design-ci-judge-evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyCronRequestMock.mockReturnValue(null);
    upsertMock.mockResolvedValue({ written: ['x'], skippedUnchanged: [] });
  });

  it('rejects unauthenticated callers before reading the body', async () => {
    verifyCronRequestMock.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );
    const response = await post({ evaluatedAt: EVALUATED_AT, cells: [cell()] });
    expect(response.status).toBe(401);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('upserts a valid batch at the stated evaluation time', async () => {
    const response = await post({ evaluatedAt: EVALUATED_AT, cells: [cell()] });
    expect(response.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledWith([cell()], EVALUATED_AT);
  });

  it.each([
    ['unknown fields', [cell({ founderDecision: 'approved' })]],
    ['an unknown route', [cell({ route: 'astra' })]],
    ['an unknown state', [cell({ state: 'blocked' })]],
    ['a malformed fingerprint', [cell({ artifactHash: 'not-a-hash' })]],
    ['an empty batch', []],
  ])('rejects %s without touching the store', async (_label, cells) => {
    const response = await post({ evaluatedAt: EVALUATED_AT, cells });
    expect(response.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('rejects oversized and malformed bodies', async () => {
    expect((await post('x'.repeat(257 * 1024))).status).toBe(413);
    expect((await post('{not json')).status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('maps store rejections to 422 and unexpected failures to 503', async () => {
    upsertMock.mockRejectedValueOnce(
      new DesignCiJudgeCertificationPersistenceError('malformed ledger')
    );
    expect(
      (await post({ evaluatedAt: EVALUATED_AT, cells: [cell()] })).status
    ).toBe(422);
    upsertMock.mockRejectedValueOnce(new Error('db down'));
    expect(
      (await post({ evaluatedAt: EVALUATED_AT, cells: [cell()] })).status
    ).toBe(503);
  });
});
