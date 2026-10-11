import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  limit: vi.fn(),
  create: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  allowIfRateLimitBackendDegraded: (result: unknown) => result,
  createRateLimitHeaders: () => ({ 'Retry-After': '60' }),
  getClientIP: () => '203.0.113.10',
  publicClickLimiter: { limit: hoisted.limit },
}));
vi.mock('@/lib/feedback', () => ({ createFeedbackItem: hoisted.create }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

const { POST } = await import('./route');

function post(body: unknown) {
  return POST(
    new Request('https://jov.ie/api/agents/feedback', {
      method: 'POST',
      headers: { 'user-agent': 'jovie-cli/26.9.15' },
      body: JSON.stringify(body),
    })
  );
}

const valid = {
  kind: 'bug',
  title: 'profile create fails',
  details: 'Valid Spotify URL returned CREATE_FAILED.',
  context: { cliVersion: '26.9.15', command: 'profile create', exitCode: 1 },
};

describe('POST /api/agents/feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.limit.mockResolvedValue({ success: true });
    hoisted.create.mockResolvedValue({ id: 'r-1' });
  });

  it('stores a report under agent_cli and returns a reportId', async () => {
    const res = await post(valid);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ reportId: 'r-1' });
    expect(hoisted.create).toHaveBeenCalledWith({
      userId: null,
      message:
        '[bug] profile create fails\n\nValid Spotify URL returned CREATE_FAILED.',
      source: 'agent_cli',
      context: expect.objectContaining({
        userAgent: 'jovie-cli/26.9.15',
        agentReport: {
          kind: 'bug',
          title: 'profile create fails',
          cliVersion: '26.9.15',
          command: 'profile create',
          exitCode: 1,
        },
      }),
    });
  });

  it('rejects undeclared context so secrets cannot ride along', async () => {
    const res = await post({
      ...valid,
      context: { ...valid.context, env: { NPM_TOKEN: 'x' } },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('VALIDATION_FAILED');
    expect(hoisted.create).not.toHaveBeenCalled();
  });

  it('rejects malformed reports and accepts a bare one', async () => {
    expect(
      (await post({ kind: 'rant', title: 'x', details: 'y' })).status
    ).toBe(400);
    expect((await post(null)).status).toBe(400);
    expect(
      (await post({ kind: 'feedback', title: 't', details: 'd' })).status
    ).toBe(201);
  });

  it('rate limits and surfaces storage failures', async () => {
    hoisted.limit.mockResolvedValueOnce({ success: false });
    expect((await post(valid)).status).toBe(429);
    hoisted.create.mockRejectedValueOnce(new Error('db down'));
    const res = await post(valid);
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe('INTERNAL');
  });
});
