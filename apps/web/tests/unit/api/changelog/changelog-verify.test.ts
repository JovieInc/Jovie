import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn());

// Tagged operator results so the in-test db mock can read the query shape
// (which column, which value) without depending on drizzle internals.
vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: unknown) => ({ op: 'eq', col, val }),
  and: (...children: unknown[]) => ({ op: 'and', children }),
  gt: (col: string, val: unknown) => ({ op: 'gt', col, val }),
}));

const UUID_TOKEN = '11111111-4111-4111-8111-111111111111';

/** Select chain that emulates the production Postgres uuid column: a token
 * that is not a uuid is rejected by the database itself. */
function selectRejectingMalformedUuids() {
  return () => ({
    from: () => ({
      where: (condition: { op: string; children?: unknown[] }) => {
        const tokenCondition = (condition.children ?? []).find(
          child =>
            typeof child === 'object' &&
            child !== null &&
            (child as { op?: string; col?: string }).op === 'eq' &&
            (child as { col?: string }).col === 'verificationToken'
        ) as { val?: string } | undefined;
        if (
          !tokenCondition ||
          !/^[0-9a-f-]{36}$/i.test(tokenCondition.val ?? '')
        ) {
          throw new Error('invalid input syntax for type uuid');
        }
        return { limit: () => Promise.resolve([]) };
      },
    }),
  });
}

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
}));

vi.mock('@/lib/db/schema/product-update-subscribers', () => ({
  productUpdateSubscribers: {
    verificationToken: 'verificationToken',
    tokenExpiresAt: 'tokenExpiresAt',
    id: 'id',
  },
}));

vi.mock('@/constants/app', () => ({
  APP_NAME: 'Jovie',
  BASE_URL: 'https://meetjovie.com',
}));

describe('/api/changelog/verify', () => {
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

    const { GET } = await import('@/app/api/changelog/verify/route');
    const request = new NextRequest(
      `http://localhost/api/changelog/verify?token=${UUID_TOKEN}`
    );
    const response = await GET(request);
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(response.headers.get('Content-Type')).toBe('text/html');
    expect(body).toContain('Something went wrong');
  });

  it('returns 400 for a malformed non-uuid token instead of a database 500', async () => {
    // Regression for the production observation on 2026-10-24: a token that
    // is not a uuid made the Postgres uuid column reject the query, which
    // surfaced as a 500. This fails before the uuid-shape guard exists: the
    // route passed the raw token to the database and returned the 500 card.
    mockDbSelect.mockImplementation(selectRejectingMalformedUuids());

    const { GET } = await import('@/app/api/changelog/verify/route');
    const request = new NextRequest(
      'http://localhost/api/changelog/verify?token=outcome-jov7494-invalid-token'
    );
    const response = await GET(request);
    const body = await response.text();

    expect(response.status).toBe(400);
    expect(response.headers.get('Content-Type')).toBe('text/html');
    expect(body).toContain('Invalid link');
    expect(body).toContain('This verification link is missing or malformed.');
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it('returns 410 for a well-formed token that matches no subscriber', async () => {
    mockDbSelect.mockImplementation(selectRejectingMalformedUuids());

    const { GET } = await import('@/app/api/changelog/verify/route');
    const request = new NextRequest(
      'http://localhost/api/changelog/verify?token=00000000-0000-4000-8000-000000000000'
    );
    const response = await GET(request);
    const body = await response.text();

    expect(response.status).toBe(410);
    expect(body).toContain('Link expired');
    expect(body).toContain('Resubscribe');
  });

  it('returns 400 when token is missing', async () => {
    const { GET } = await import('@/app/api/changelog/verify/route');
    const request = new NextRequest('http://localhost/api/changelog/verify');
    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(await response.text()).toContain('Invalid link');
  });
});
