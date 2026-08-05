import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  result: [] as Array<{ username: string }>,
  select: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.select,
  },
}));

function makeQuery() {
  const query = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockImplementation(async () => hoisted.result),
  };
  query.from.mockReturnValue(query);
  query.innerJoin.mockReturnValue(query);
  query.where.mockReturnValue(query);
  return query;
}

const { GET } = await import('@/app/artists/[artistId]/route');

function context(artistId: string) {
  return { params: Promise.resolve({ artistId }) };
}

describe('GET /artists/[artistId]', () => {
  beforeEach(() => {
    hoisted.result = [];
    hoisted.select.mockReset().mockReturnValue(makeQuery());
  });

  it('rejects malformed entity IDs without querying identity data', async () => {
    const response = await GET(
      new Request('https://jov.ie/artists/not-an-id') as never,
      context('not-an-id')
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(hoisted.select).not.toHaveBeenCalled();
  });

  it('redirects a public registry entity to its current handle without caching', async () => {
    hoisted.result = [{ username: 'new-handle' }];
    const artistId = 'f5441adb-6789-449a-9553-ab7460c9c61c';
    const response = await GET(
      new Request(`https://jov.ie/artists/${artistId}`) as never,
      context(artistId)
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('Location')).toBe('https://jov.ie/new-handle');
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });

  it('preserves the registry link when a claimed profile changes handle', async () => {
    const artistId = 'f5441adb-6789-449a-9553-ab7460c9c61c';
    hoisted.result = [{ username: 'a_eiqd46x3irj64dlgo8a3glau4' }];
    const beforeClaim = await GET(
      new Request(`https://jov.ie/artists/${artistId}`) as never,
      context(artistId)
    );

    hoisted.result = [{ username: 'austin-leeds' }];
    const afterRename = await GET(
      new Request(`https://jov.ie/artists/${artistId}`) as never,
      context(artistId)
    );

    expect(beforeClaim.headers.get('Location')).toBe(
      'https://jov.ie/a_eiqd46x3irj64dlgo8a3glau4'
    );
    expect(afterRename.headers.get('Location')).toBe(
      'https://jov.ie/austin-leeds'
    );
  });

  it('fails closed for missing or private profile bindings', async () => {
    const artistId = '3cefe948-7521-465f-813a-95ae15e3141e';
    const response = await GET(
      new Request(`https://jov.ie/artists/${artistId}`) as never,
      context(artistId)
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('Location')).toBeNull();
  });
});
