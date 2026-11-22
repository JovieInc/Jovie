import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  save: vi.fn(),
  limit: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: hoisted.requireAuth,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/rate-limit', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  generalLimiter: { limit: hoisted.limit },
}));
vi.mock('@/lib/views/service.server', () => {
  class PublishViewError extends Error {
    constructor(
      readonly code: string,
      message: string
    ) {
      super(message);
    }
  }
  return { PublishViewError, saveViewAsDashboard: hoisted.save };
});

import { POST } from '@/app/api/views/[token]/save/route';
import { PublishViewError } from '@/lib/views/service.server';

const params = (token: string) => ({ params: Promise.resolve({ token }) });
const request = new NextRequest('http://localhost/api/views/x/save', {
  method: 'POST',
});

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.limit.mockResolvedValue({ success: true });
});

describe('POST /api/views/[token]/save', () => {
  it('returns 401 when signed out', async () => {
    hoisted.requireAuth.mockResolvedValue({
      userId: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });
    const res = await POST(request, params('a'.repeat(32)));
    expect(res.status).toBe(401);
    expect(hoisted.save).not.toHaveBeenCalled();
  });

  it('saves the view for the signed-in user', async () => {
    hoisted.requireAuth.mockResolvedValue({ userId: 'user-1', error: null });
    const payload = { id: 'v', token: 'b'.repeat(32), url: 'u', created: true };
    hoisted.save.mockResolvedValue(payload);
    const res = await POST(request, params('a'.repeat(32)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(payload);
    expect(hoisted.save).toHaveBeenCalledWith({
      token: 'a'.repeat(32),
      userId: 'user-1',
    });
  });

  it('returns 404 when the view is missing or revoked', async () => {
    hoisted.requireAuth.mockResolvedValue({ userId: 'user-1', error: null });
    hoisted.save.mockRejectedValue(
      new PublishViewError('view_not_found', 'View not found')
    );
    const res = await POST(request, params('a'.repeat(32)));
    expect(res.status).toBe(404);
  });

  it('returns 429 when rate limited', async () => {
    hoisted.requireAuth.mockResolvedValue({ userId: 'user-1', error: null });
    hoisted.limit.mockResolvedValue({
      success: false,
      limit: 10,
      remaining: 0,
      reset: new Date('2026-11-22T00:00:00Z'),
    });
    const res = await POST(request, params('a'.repeat(32)));
    expect(res.status).toBe(429);
  });
});
