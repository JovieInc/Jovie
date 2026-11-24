// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: { SYNTHETIC_PASSAGE_TOKENS_DISABLED: undefined as string | undefined },
  cronAuth: vi.fn(),
  passageResolve: vi.fn(),
  limiter: vi.fn(),
  count: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({ metrics: { count: mocks.count } }));
vi.mock('@/lib/env-server', () => ({ env: mocks.env }));
vi.mock('@/lib/cron/auth', () => ({
  verifyCronRequest: mocks.cronAuth,
}));
vi.mock('@/lib/synthetic/passage-token.server', () => ({
  resolveSyntheticPassageTokenDetailed: mocks.passageResolve,
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

function grantOnce() {
  return {
    grant: {
      actorId: 'prodcert' as const,
      claims: { run: 'run-1', sub: 'x' },
    },
    denyCause: null,
  };
}

describe('POST /api/internal/canary/reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.SYNTHETIC_PASSAGE_TOKENS_DISABLED = undefined;
    mocks.cronAuth.mockReturnValue(null);
    mocks.passageResolve.mockResolvedValue(grantOnce());
    mocks.limiter.mockResolvedValue({ success: true });
    mocks.count.mockReset();
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
    expect(mocks.limiter).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('requires the CRON_SECRET bearer', async () => {
    mocks.cronAuth.mockReturnValue(
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    );
    const response = await POST(postRequest());
    expect(response.status).toBe(401);
    expect(mocks.limiter).not.toHaveBeenCalled();
    expect(mocks.passageResolve).not.toHaveBeenCalled();
  });

  it('requires a consumable canary_reset passage token', async () => {
    mocks.passageResolve.mockResolvedValue({
      grant: null,
      denyCause: 'invalid_token',
    });
    const response = await POST(postRequest());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: 'Valid canary passage token required',
    });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.count).not.toHaveBeenCalled();
    expect(mocks.passageResolve).toHaveBeenCalledWith(
      expect.objectContaining({ get: expect.any(Function) }),
      'canary_reset',
      expect.objectContaining({ consume: true })
    );
  });

  it('charges the reset budget BEFORE consuming the passage token (JOV-9826)', async () => {
    // Red 45350750159: with the passage token consumed first, a budget-denied
    // hour burned BOTH windows and the passage denial masqueraded as the
    // opaque 401. The reset window is now charged first, so a denied hour
    // costs this budget only and no passage grant is spent on it.
    mocks.passageResolve.mockResolvedValue({
      grant: null,
      denyCause: 'invalid_token',
    });
    await POST(postRequest());
    const limiterOrder = mocks.limiter.mock.invocationCallOrder[0];
    const resolveOrder = mocks.passageResolve.mock.invocationCallOrder[0];
    expect(limiterOrder).toBeDefined();
    expect(resolveOrder).toBeGreaterThan(limiterOrder as number);
  });

  it('names the passage-grant budget as a 429, never the opaque 401 (JOV-9826)', async () => {
    // The cert red must say "shared hourly budget", not auth drift: the
    // 12/h shared window exhaustion (run 45350750159 class) previously
    // returned the identical body as a bad token.
    mocks.passageResolve.mockResolvedValue({
      grant: null,
      denyCause: 'rate_limited',
    });
    const response = await POST(postRequest());
    expect(response.status).toBe(429);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain('Canary passage budget exhausted');
    expect(body.error).not.toContain('Valid canary passage token required');
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.count).toHaveBeenCalledExactlyOnceWith(
      'synthetic.canary_reset.denied',
      1,
      { attributes: { reason: 'passage_budget_exhausted' } }
    );
  });

  it.each([
    [false, 'budget_exhausted'],
    [true, 'limiter_unavailable'],
  ] as const)(
    'fails closed on the reset budget without consuming a passage token (unavailable=%s)',
    async (unavailable, reason) => {
      mocks.limiter.mockResolvedValue({ success: false, unavailable });
      const response = await POST(postRequest());
      expect(response.status).toBe(429);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({
        error: 'Canary reset rate limit exceeded',
      });
      expect(mocks.execute).not.toHaveBeenCalled();
      // No single-use passage grant is spent on a budget-denied attempt.
      expect(mocks.passageResolve).not.toHaveBeenCalled();
      expect(mocks.count).toHaveBeenCalledExactlyOnceWith(
        'synthetic.canary_reset.denied',
        1,
        { attributes: { reason } }
      );
    }
  );

  it('preserves fail-closed behavior if denial telemetry throws', async () => {
    mocks.limiter.mockResolvedValue({ success: false, unavailable: true });
    mocks.count.mockImplementation(() => {
      throw new Error('metrics unavailable');
    });
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
    expect(mocks.count).not.toHaveBeenCalled();
  });
});
