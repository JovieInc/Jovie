import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { PUT } from '@/app/api/dashboard/social-links/route';

const hoisted = vi.hoisted(() => {
  const withDbSession = vi.fn(
    async (callback: (userId: string) => Promise<Response>) =>
      callback('user_123')
  );

  const select = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 'profile_123' }]),
        }),
      }),
    }),
  });

  return { withDbSession, select };
});

vi.mock('@/lib/auth/session', () => ({
  withDbSession: hoisted.withDbSession,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.select,
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  creatorProfiles: { id: 'id', userId: 'user_id' },
  socialLinks: { id: 'id', creatorProfileId: 'creator_profile_id' },
  users: { id: 'id', clerkId: 'clerk_id' },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  eq: vi.fn((left: unknown, right: unknown) => [left, right]),
}));

describe('PUT /api/dashboard/social-links', () => {
  it('returns 400 for invalid request body', async () => {
    const request = new NextRequest(
      'http://localhost/api/dashboard/social-links',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'not-json',
      }
    );

    const response = await PUT(request as unknown as Request);

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error?: string };
    expect(data.error).toBe('Invalid request body');
  });

  it('rejects dangerous URL protocols', async () => {
    const request = new NextRequest(
      'http://localhost/api/dashboard/social-links',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: 'profile_123',
          links: [
            {
              platform: 'website',
              url: 'javascript:alert(1)',
            },
          ],
        }),
      }
    );

    const response = await PUT(request as unknown as Request);

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error?: string };
    expect(data.error).toContain('Invalid URL protocol');
  });

  it('returns 400 when platform is invalid', async () => {
    const request = new NextRequest(
      'http://localhost/api/dashboard/social-links',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: 'profile_123',
          links: [
            {
              platform: 'not_a_platform',
              url: 'https://example.com',
            },
          ],
        }),
      }
    );

    const response = await PUT(request as unknown as Request);

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error?: string };
    expect(data.error).toBe('Invalid platform');
  });

  it('returns 200 and ok true for valid payload', async () => {
    const request = new NextRequest(
      'http://localhost/api/dashboard/social-links',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: 'profile_123',
          links: [
            {
              platform: 'website',
              url: 'https://example.com',
            },
          ],
        }),
      }
    );

    const response = await PUT(request as unknown as Request);

    expect(response.status).toBe(200);
    const data = (await response.json()) as { ok?: boolean };
    expect(data.ok).toBe(true);
  });
});
