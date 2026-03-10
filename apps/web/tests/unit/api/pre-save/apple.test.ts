import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.hoisted(() => vi.fn());
const mockServerFetch = vi.hoisted(() => vi.fn());

const mockInsertValues = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockDbInsert = vi.hoisted(() =>
  vi.fn(() => ({ values: mockInsertValues }))
);

const mockSelectLimitUsers = vi.hoisted(() =>
  vi.fn().mockResolvedValue([{ id: 'user-1', email: 'fan@example.com' }])
);
const mockSelectLimitProviderLinks = vi.hoisted(() =>
  vi.fn().mockResolvedValue([{ externalId: 'apple-album-1' }])
);
const mockDbSelect = vi.hoisted(() =>
  vi
    .fn()
    .mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: mockSelectLimitUsers })),
      })),
    })
    .mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: mockSelectLimitProviderLinks })),
      })),
    })
);

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/http/server-fetch', () => ({
  ServerFetchTimeoutError: class ServerFetchTimeoutError extends Error {
    constructor(
      message: string,
      public readonly timeoutMs: number
    ) {
      super(message);
      this.name = 'ServerFetchTimeoutError';
    }
  },
  serverFetch: mockServerFetch,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: { id: 'id', email: 'email', clerkId: 'clerkId' },
}));
vi.mock('@/lib/db/schema/content', () => ({
  providerLinks: {
    externalId: 'externalId',
    providerId: 'providerId',
    ownerType: 'ownerType',
    trackId: 'trackId',
    releaseId: 'releaseId',
  },
}));
vi.mock('@/lib/db/schema/pre-save', () => ({ preSaveTokens: {} }));
vi.mock('@/lib/env-server', () => ({
  env: { APPLE_MUSIC_DEVELOPER_TOKEN: 'dev-token' },
}));
vi.mock('@/lib/utils/pii-encryption', () => ({
  encryptPII: vi.fn(() => 'encrypted'),
}));
vi.mock('drizzle-orm', () => ({ and: vi.fn(), eq: vi.fn() }));

describe('POST /api/pre-save/apple', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'clerk_123' });
    mockDbSelect
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: mockSelectLimitUsers })),
        })),
      })
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: mockSelectLimitProviderLinks })),
        })),
      });
  });

  it('returns 504 when apple request times out', async () => {
    const { ServerFetchTimeoutError } = await import('@/lib/http/server-fetch');
    mockServerFetch.mockRejectedValueOnce(
      new ServerFetchTimeoutError('timed out', 10_000)
    );

    const { POST } = await import('@/app/api/pre-save/apple/route');
    const request = new NextRequest('http://localhost/api/pre-save/apple', {
      method: 'POST',
      body: JSON.stringify({
        releaseId: '550e8400-e29b-41d4-a716-446655440000',
        appleMusicUserToken: 'x'.repeat(25),
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({
      error: 'Apple Music pre-add timed out',
    });
  });

  it('returns 502 when apple request has network failure', async () => {
    mockServerFetch.mockRejectedValueOnce(new Error('network down'));

    const { POST } = await import('@/app/api/pre-save/apple/route');
    const request = new NextRequest('http://localhost/api/pre-save/apple', {
      method: 'POST',
      body: JSON.stringify({
        releaseId: '550e8400-e29b-41d4-a716-446655440000',
        appleMusicUserToken: 'x'.repeat(25),
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: 'Apple Music pre-add unavailable',
    });
  });
});
