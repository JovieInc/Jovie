/**
 * Real (unmocked) auth integration coverage, alongside route.test.ts's
 * mocked verifyCronRequest tests. This exercises the actual
 * verifyCronRequest -> timingSafeMatch -> crypto.timingSafeEqual chain
 * through the real POST handler, so a wiring regression that route.test.ts's
 * mock would mask (e.g. handleCronEvidencePost silently skipping the real
 * auth call) still fails here.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const { upsertMock } = vi.hoisted(() => ({ upsertMock: vi.fn() }));

vi.mock('@/lib/agent-os/design-ci-judge-runtime-store', () => ({
  upsertDesignCiJudgeCells: upsertMock,
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

const FINGERPRINT = `sha256:${'a'.repeat(64)}`;
const EVALUATED_AT = '2026-09-29T00:00:00.000Z';

function cell() {
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
  };
}

async function post(authorization: string | undefined) {
  const { POST } = await import('./route');
  return POST(
    new Request('https://jov.ie/api/internal/ovie/design-ci-judge-evidence', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(authorization ? { authorization } : {}),
      },
      body: JSON.stringify({ evaluatedAt: EVALUATED_AT, cells: [cell()] }),
    })
  );
}

describe('POST /api/internal/ovie/design-ci-judge-evidence: real auth', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    upsertMock.mockClear();
  });

  it('a wrong secret gets 401 through the real auth chain, with no store write', async () => {
    vi.stubEnv('CRON_SECRET', 'the-real-secret');
    const response = await post('Bearer wrong-secret');
    expect(response.status).toBe(401);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('a missing secret header gets 401 through the real auth chain, with no store write', async () => {
    vi.stubEnv('CRON_SECRET', 'the-real-secret');
    const response = await post(undefined);
    expect(response.status).toBe(401);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('an unconfigured CRON_SECRET fails closed at 500, not open', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const response = await post('Bearer anything');
    expect(response.status).toBe(500);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('the real secret is accepted and reaches the store', async () => {
    upsertMock.mockResolvedValue({ written: ['x'], skippedUnchanged: [] });
    vi.stubEnv('CRON_SECRET', 'the-real-secret');
    const response = await post('Bearer the-real-secret');
    expect(response.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });
});
