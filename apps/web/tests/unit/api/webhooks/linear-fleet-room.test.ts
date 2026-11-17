import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSchedule = vi.hoisted(() => vi.fn());

vi.mock('@/lib/env-server', () => ({
  env: { LINEAR_WEBHOOK_SECRET: 'linear-secret', GH_DISPATCH_TOKEN: 'gh' },
}));
vi.mock('@/lib/error-tracking', () => ({ captureCriticalError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/webhooks/recent-dispatch', () => ({
  acquireRecentDispatch: vi.fn(),
  clearRecentDispatch: vi.fn(),
}));
vi.mock('@/lib/ovie/fleet-room.server', () => ({
  scheduleFleetRoomWebhook: mockSchedule,
}));

describe('Linear webhook to Ovie fleet room', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-11T21:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('hands each verified payload to the fleet room and keeps its own outcome', async () => {
    const { POST } = await import('@/app/api/webhooks/linear/route');
    const payload = {
      type: 'Comment',
      action: 'create',
      createdAt: '2026-11-11T20:59:00.000Z',
      data: { id: 'c1', body: '[Lola → Elsa] hi', createdAt: '2026-11-11' },
    };
    const body = JSON.stringify(payload);
    const signature = createHmac('sha256', 'linear-secret')
      .update(body)
      .digest('hex');
    const response = await POST(
      new Request('https://example.com/api/webhooks/linear', {
        method: 'POST',
        headers: { 'linear-signature': signature },
        body,
      }) as never
    );
    expect(mockSchedule).toHaveBeenCalledWith(payload);
    expect(response.status).toBe(200);
  });

  it('never reaches the fleet room with an unsigned body', async () => {
    mockSchedule.mockClear();
    const { POST } = await import('@/app/api/webhooks/linear/route');
    const response = await POST(
      new Request('https://example.com/api/webhooks/linear', {
        method: 'POST',
        headers: { 'linear-signature': 'bad' },
        body: '{}',
      }) as never
    );
    expect(response.status).toBe(401);
    expect(mockSchedule).not.toHaveBeenCalled();
  });
});
