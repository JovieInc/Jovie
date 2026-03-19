import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
}));

vi.mock('@/lib/db/schema/product-update-subscribers', () => ({
  productUpdateSubscribers: {
    unsubscribeToken: 'unsubscribeToken',
    unsubscribedAt: 'unsubscribedAt',
    id: 'id',
  },
}));

vi.mock('@/constants/app', () => ({
  APP_NAME: 'Jovie',
  APP_URL: 'https://meetjovie.com',
}));

describe('/api/changelog/unsubscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 500 with friendly HTML when DB query throws', async () => {
    mockDbSelect.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: () => {
            throw new Error('DB connection failed');
          },
        }),
      }),
    }));

    const { GET } = await import('@/app/api/changelog/unsubscribe/route');
    const request = new NextRequest(
      'http://localhost/api/changelog/unsubscribe?token=test-token'
    );
    const response = await GET(request);
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(response.headers.get('Content-Type')).toBe('text/html');
    expect(body).toContain('Something went wrong');
  });

  it('returns 400 when token is missing', async () => {
    const { GET } = await import('@/app/api/changelog/unsubscribe/route');
    const request = new NextRequest(
      'http://localhost/api/changelog/unsubscribe'
    );
    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(await response.text()).toContain('Invalid link');
  });

  it('delegates POST to GET (RFC 8058 one-click unsubscribe)', async () => {
    mockDbSelect.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: () => {
            throw new Error('DB connection failed');
          },
        }),
      }),
    }));

    const { POST } = await import('@/app/api/changelog/unsubscribe/route');
    const request = new NextRequest(
      'http://localhost/api/changelog/unsubscribe?token=test-token'
    );
    const response = await POST(request);

    expect(response.status).toBe(500);
    expect(await response.text()).toContain('Something went wrong');
  });
});
