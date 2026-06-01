import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCaptureCriticalError = vi.hoisted(() => vi.fn());
const mockAcquireRecentDispatch = vi.hoisted(() => vi.fn());
const mockClearRecentDispatch = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());
const mockLoggerWarn = vi.hoisted(() => vi.fn());
const mockLoggerInfo = vi.hoisted(() => vi.fn());

vi.mock('@/lib/env-server', () => ({
  env: {
    ELEVENLABS_WEBHOOK_SECRET: 'voice-test-secret',
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mockCaptureCriticalError,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: mockLoggerError,
    warn: mockLoggerWarn,
    info: mockLoggerInfo,
  },
}));

vi.mock('@/lib/webhooks/recent-dispatch', () => ({
  acquireRecentDispatch: mockAcquireRecentDispatch,
  clearRecentDispatch: mockClearRecentDispatch,
}));

function sign(body: string, secret = 'voice-test-secret'): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

describe('POST /api/webhooks/voice-pipeline (gh-9810)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('rejects missing signature', async () => {
    const { POST } = await import('@/app/api/webhooks/voice-pipeline/route');
    const req = new Request('http://localhost/api/webhooks/voice-pipeline', {
      method: 'POST',
      body: JSON.stringify({ id: 'evt_1', type: 'voice_generation.completed' }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing signature header' });
  });

  it('rejects invalid signature', async () => {
    const { POST } = await import('@/app/api/webhooks/voice-pipeline/route');
    const body = JSON.stringify({ id: 'evt_bad_sig' });
    const req = new Request('http://localhost/api/webhooks/voice-pipeline', {
      method: 'POST',
      headers: { 'elevenlabs-signature': 'deadbeef' },
      body,
    });

    const res = await POST(req as any);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Invalid signature' });
    expect(mockCaptureCriticalError).toHaveBeenCalled();
  });

  it('deduplicates recent events', async () => {
    mockAcquireRecentDispatch.mockResolvedValue({
      acquired: false,
      reason: 'duplicate',
    });

    const { POST } = await import('@/app/api/webhooks/voice-pipeline/route');
    const body = JSON.stringify({
      id: 'evt_dup',
      type: 'voice_cloning.completed',
    });
    const sig = sign(body);
    const req = new Request('http://localhost/api/webhooks/voice-pipeline', {
      method: 'POST',
      headers: { 'elevenlabs-signature': sig },
      body,
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ received: true, deduped: true });
  });

  it('accepts valid signed event and clears dedupe lock', async () => {
    mockAcquireRecentDispatch.mockResolvedValue({
      acquired: true,
      reason: 'acquired',
    });
    mockClearRecentDispatch.mockResolvedValue(undefined);

    const { POST } = await import('@/app/api/webhooks/voice-pipeline/route');
    const body = JSON.stringify({
      id: 'evt_good_123',
      type: 'voice_generation.completed',
      status: 'success',
    });
    const sig = sign(body);
    const req = new Request('http://localhost/api/webhooks/voice-pipeline', {
      method: 'POST',
      headers: { 'elevenlabs-signature': sig },
      body,
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.stringContaining('Event received'),
      expect.objectContaining({ eventId: 'evt_good_123' })
    );
    expect(mockClearRecentDispatch).toHaveBeenCalledWith(
      'voice-pipeline',
      'evt_good_123'
    );
  });
});
