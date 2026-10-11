import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  session: vi.fn(),
  load: vi.fn(),
}));
vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: mocks.auth }));
vi.mock('@/lib/auth/session', () => ({
  getSessionContext: mocks.session,
  SESSION_ERRORS: {
    USER_NOT_FOUND: 'User not found',
    PROFILE_NOT_FOUND: 'Profile not found',
    UNAUTHORIZED: 'Unauthorized',
  },
}));
vi.mock('@/lib/activity/load-jovie-work-feed', () => ({
  loadJovieWorkFeed: mocks.load,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

import { GET } from './route';

const profileId = '11111111-1111-4111-8111-111111111111';
const foreignProfileId = '22222222-2222-4222-8222-222222222222';
const request = (params = '') =>
  new NextRequest(
    `https://example.com/api/dashboard/jovie-work/recent?${params}`
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ userId: 'actor-1' });
  mocks.session.mockResolvedValue({
    user: { id: 'owner-1' },
    profile: { id: profileId },
    clerkUserId: 'actor-1',
  });
  mocks.load.mockResolvedValue([]);
});

describe('creator work API context and caching', () => {
  it('derives the actor from auth, ignores forged owner params, and never browser-caches the response', async () => {
    const response = await GET(
      request(`profileId=${profileId}&userId=foreign-owner&phase=completed`)
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.load).toHaveBeenCalledWith({
      userId: 'owner-1',
      creatorProfileId: profileId,
      limit: 20,
      range: '7d',
      phase: 'completed',
    });
  });
  it('fails closed when a stale request targets a different selected profile', async () => {
    const response = await GET(request(`profileId=${foreignProfileId}`));
    expect(response.status).toBe(409);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it('does not load creator work without an authenticated actor', async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it('rejects an invalid profile or activity phase before loading payloads', async () => {
    expect((await GET(request('profileId=invalid'))).status).toBe(400);
    expect((await GET(request('phase=in_progress'))).status).toBe(400);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it('returns a retryable failure instead of inventing an empty or completed feed', async () => {
    mocks.load.mockRejectedValue(new Error('storage unavailable'));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toHaveProperty('error');
  });
});
