// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: { SYNTHETIC_PASSAGE_TOKENS_DISABLED: undefined as string | undefined },
  cronAuth: vi.fn<[], null>(),
  passageGrant: vi.fn(),
  limiter: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('@/lib/env-server', () => ({ env: mocks.env }));
vi.mock('@/lib/cron/auth', () => ({
  verifyCronRequest: mocks.cronAuth,
}));
vi.mock('@/lib/synthetic/passage-token.server', () => ({
  resolveSyntheticPassageToken: mocks.passageGrant,
}));
vi.mock('@/lib/rate-limit', () => ({
  createRateLimiter: () => ({ limit: mocks.limiter }),
}));
vi.mock('@/lib/synthetic/canary-reset.server', () => ({
  executeCanaryReset: mocks.execute,
}));

import { GET, POST } from './route';

function postRequest(): Request {
  return new Request('https://jov.ie/api/internal/canary/reset', {
    method: 'POST',
    headers: { authorization: 'Bearer cron-secret' },
  });
}

describe('POST /api/internal/canary/reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.SYNTHETIC_PASSAGE_TOKENS_DISABLED = undefined;
    mocks.cronAuth.mockReturnValue(null);
    mocks.passageGrant.mockResolvedValue({
      actorId: 'prodcert',
      claims: { run: 'run-1', sub: 'x' },
    });
    mocks.limiter.mockResolvedValue({ success: true });
    mocks.execute.mockResolvedValue({
      ok: true,
      summary: 'claims=1 profiles=1',
    });
  });

  it('rejects GET', async () => {
    const response = await GET();
    expect(response.status).toBe(405);
  });

  it('fails closed on the kill switch before any auth work', async () => {
    mocks.env.SYNTHETIC_PASSAGE_TOKENS_DISABLED = '1';
    const response = await POST(postRequest());
    expect(response.status).toBe(503);
    expect(mocks.cronAuth).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('requires the CRON_SECRET bearer', async () => {
    mocks.cronAuth.mockReturnValue(
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    );
    const response = await POST(postRequest());
    expect(response.status).toBe(401);
    expect(mocks.passageGrant).not.toHaveBeenCalled();
  });

  it('requires a consumable canary_reset passage token', async () => {
    mocks.passageGrant.mockResolvedValue(null);
    const response = await POST(postRequest());
    expect(response.status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.passageGrant).toHaveBeenCalledWith(
      expect.objectContaining({ get: expect.any(Function) }),
      'canary_reset',
      expect.objectContaining({ consume: true })
    );
  });

  it('fails closed when the 6/hour reset budget is exhausted', async () => {
    mocks.limiter.mockResolvedValue({ success: false });
    const response = await POST(postRequest());
    expect(response.status).toBe(429);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('reports an unprovisioned canary account as 409', async () => {
    mocks.execute.mockResolvedValue({ ok: false });
    const response = await POST(postRequest());
    expect(response.status).toBe(409);
  });

  it('completes the reset and returns the redacted summary', async () => {
    const response = await POST(postRequest());
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.reset).toBe('completed');
    expect(body.run).toBe('run-1');
    expect(body.summary).toBe('claims=1 profiles=1');
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
});
