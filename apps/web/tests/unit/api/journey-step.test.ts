import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  record: vi.fn(),
  limit: vi.fn(),
  detectBot: vi.fn(),
}));

vi.mock('@/lib/analytics/signup-funnel.server', () => ({
  recordFunnelStep: hoisted.record,
}));
vi.mock('@/lib/rate-limit', () => ({
  getClientIP: () => '203.0.113.7',
  trackingIpVisitsLimiter: { limit: hoisted.limit },
}));
vi.mock('@/lib/utils/bot-detection', () => ({
  detectBot: hoisted.detectBot,
}));

const { POST } = await import('@/app/api/journey/step/route');

const post = (body: unknown) =>
  POST(
    new NextRequest('https://jov.ie/api/journey/step', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );

describe('POST /api/journey/step', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.detectBot.mockReturnValue({ isBot: false });
    hoisted.limit.mockResolvedValue({ success: true });
    hoisted.record.mockResolvedValue(undefined);
  });

  it('records a valid client step', async () => {
    const response = await post({
      funnel: 'artist_signup',
      step: 'cta_click',
      surface: 'homepage',
    });
    expect(response.status).toBe(204);
    expect(hoisted.record).toHaveBeenCalledWith({
      funnel: 'artist_signup',
      step: 'cta_click',
      outcome: undefined,
      surface: 'homepage',
      reason: undefined,
    });
    expect(hoisted.limit).toHaveBeenCalledWith('journey:203.0.113.7');
  });

  it.each([
    ['unknown funnel', { funnel: 'lyb', step: 'cta_click' }],
    [
      'server-owned surface',
      {
        funnel: 'artist_signup',
        step: 'cta_click',
        surface: 'server',
      },
    ],
    [
      'extra identifying fields',
      {
        funnel: 'fan_subscribe',
        step: 'cta_click',
        email: 'fan@example.com',
      },
    ],
    ['non-JSON body', 'not json'],
  ])('rejects %s with 400 and records nothing', async (_label, body) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(hoisted.record).not.toHaveBeenCalled();
  });

  it('acknowledges and drops bot traffic', async () => {
    hoisted.detectBot.mockReturnValue({ isBot: true });
    const response = await post({ funnel: 'fan_subscribe', step: 'cta_click' });
    expect(response.status).toBe(204);
    expect(hoisted.limit).not.toHaveBeenCalled();
    expect(hoisted.record).not.toHaveBeenCalled();
  });

  it('acknowledges and drops rate-limited or degraded traffic', async () => {
    hoisted.limit.mockResolvedValueOnce({ success: false });
    hoisted.limit.mockResolvedValueOnce({ success: true, degraded: true });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await post({
        funnel: 'fan_subscribe',
        step: 'cta_click',
      });
      expect(response.status).toBe(204);
    }
    expect(hoisted.record).not.toHaveBeenCalled();
  });
});
