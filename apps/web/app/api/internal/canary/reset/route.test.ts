// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: { SYNTHETIC_PASSAGE_TOKENS_DISABLED: undefined as string | undefined },
  cronAuth: vi.fn(),
  passageResolve: vi.fn(),
  // Plain-array config log: the route constructs its limiter ONCE at module
  // import, and the assertion below must see that call. Mock call records
  // do not survive the per-test clearing (this file's clearAllMocks, plus
  // the shared setup's restoreAllMocks in the shared-worker pilot shard) —
  // a plain array does (same pattern as walkConfigs in
  // passage-token.server.test.ts).
  limiterConfigs: [] as unknown[][],
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
  // Import-time safe: route.ts constructs its route-local limiter at module
  // scope, BEFORE any beforeEach runs, so the bare-mock export
  // (`createRateLimiter: mocks.createLimiter`) returned undefined there and
  // every POST test reaching the budget step crashed on
  // `canaryResetLimiter.limit`. Record the call in the plain config log
  // (immune to mock clearing) and always return the shared limiter.
  createRateLimiter: (...args: unknown[]) => {
    mocks.limiterConfigs.push(args);
    return { limit: mocks.limiter };
  },
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

function grantFor(run: string) {
  return {
    grant: {
      actorId: 'prodcert' as const,
      claims: { run, sub: 'x' },
    },
    denyCause: null,
  };
}

describe('POST /api/internal/canary/reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.SYNTHETIC_PASSAGE_TOKENS_DISABLED = undefined;
    mocks.cronAuth.mockReturnValue(null);
    mocks.passageResolve.mockResolvedValue(grantFor('run-1'));
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
    expect(mocks.passageResolve).not.toHaveBeenCalled();
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

  it('verifies the passage token BEFORE charging the per-run reset budget (JOV-9826)', async () => {
    // The per-run budget is keyed by the VERIFIED token's run claim, so
    // verification must come first. An invalid attempt therefore burns no
    // reset budget at all — the inverse of the pre-45366385483 order, where
    // even garbage requests charged the shared global reset window.
    mocks.passageResolve.mockResolvedValue({
      grant: null,
      denyCause: 'invalid_token',
    });
    await POST(postRequest());
    const resolveOrder = mocks.passageResolve.mock.invocationCallOrder[0];
    expect(resolveOrder).toBeDefined();
    expect(mocks.limiter).not.toHaveBeenCalled();
  });

  it('names the passage-grant budget as a 429, never the opaque 401 (JOV-9826)', async () => {
    // The cert red must say "shared hourly budget", not auth drift: the
    // 12/h shared walk-grant exhaustion (run 45350750159 class) previously
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
    expect(mocks.limiter).not.toHaveBeenCalled();
    expect(mocks.count).toHaveBeenCalledExactlyOnceWith(
      'synthetic.canary_reset.denied',
      1,
      { attributes: { reason: 'passage_budget_exhausted' } }
    );
  });

  it('keys the per-run reset budget by the verified run tag (JOV-9826, red 45366385483)', async () => {
    // Red 45366385483: the GLOBAL reset key was shared across every probe
    // run, every Playwright retry and every red loop, so deploy storms
    // exhausted any fixed global size. The budget is now per run tag.
    const response = await POST(postRequest());
    expect(response.status).toBe(200);
    expect(mocks.limiter).toHaveBeenCalledExactlyOnceWith('canary-reset:run-1');
  });

  it('gives each run tag its own reset bucket', async () => {
    // A single walk's retries can never be denied by another run's
    // consumption: different run tags charge different keys.
    mocks.passageResolve
      .mockResolvedValueOnce(grantFor('run-1'))
      .mockResolvedValueOnce(grantFor('run-2'));
    await POST(postRequest());
    await POST(postRequest());
    expect(mocks.limiter).toHaveBeenNthCalledWith(1, 'canary-reset:run-1');
    expect(mocks.limiter).toHaveBeenNthCalledWith(2, 'canary-reset:run-2');
  });

  it('configures the per-run limiter as route-local and fail-closed', async () => {
    // Read the plain config log, not a mock call record: the construction
    // happens once at module import and mock history is cleared between
    // tests, while the array survives.
    const perRun = mocks.limiterConfigs.filter(
      args =>
        (args[0] as { name?: string } | undefined)?.name ===
        'Canary Reset (per run)'
    );
    expect(perRun).toHaveLength(1);
    expect(perRun[0]?.[0]).toMatchObject({
      name: 'Canary Reset (per run)',
      limit: 12,
      prefix: 'canary_reset_run',
      requireRedis: true,
    });
    expect(perRun[0]?.[1]).toMatchObject({ requireRedis: true });
  });

  it.each([
    [false, 'per_run_budget_exhausted'],
    [true, 'limiter_unavailable'],
  ] as const)(
    'fails closed on the per-run reset budget after the grant (unavailable=%s)',
    async (unavailable, reason) => {
      mocks.limiter.mockResolvedValue({ success: false, unavailable });
      const response = await POST(postRequest());
      expect(response.status).toBe(429);
      expect(response.headers.get('cache-control')).toBe('no-store');
      const body = (await response.json()) as { error: string };
      expect(body.error).toContain('Canary reset budget exhausted');
      expect(body.error).toContain('per-run hourly resets for this run tag');
      expect(mocks.execute).not.toHaveBeenCalled();
      // The single-use passage grant is consumed before the per-run charge
      // (verification keys the budget); the walk's client mints a fresh
      // token per reset call, so a retry is never blocked by a spent jti.
      expect(mocks.passageResolve).toHaveBeenCalledTimes(1);
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
