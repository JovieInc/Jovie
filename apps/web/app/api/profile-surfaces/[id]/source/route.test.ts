import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  unauthorized: vi.fn(() => false),
  source: vi.fn(),
  limit: vi.fn(),
  error: vi.fn(),
  select: vi.fn(),
  where: vi.fn(),
  join: vi.fn(),
  rows: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: mocks.session,
  isUnauthorizedSessionError: mocks.unauthorized,
}));
vi.mock('@/lib/profile-surfaces/source-identity', () => ({
  readSourceIdentity: mocks.source,
}));
vi.mock('@/lib/rate-limit', () => ({
  generalLimiter: { limit: mocks.limit },
  createRateLimitHeaders: () => ({ 'Retry-After': '60' }),
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.error }));

import { GET } from './route';

const id = '22222222-2222-4222-8222-222222222222';
const request = () =>
  new Request(`http://localhost/api/profile-surfaces/${id}/source`);
const call = (value = id) =>
  GET(request(), { params: Promise.resolve({ id: value }) });

describe('owner-authorized profile source inspection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.unauthorized.mockReturnValue(false);
    const query = {
      from: () => query,
      innerJoin: () => query,
      leftJoin: mocks.join,
      where: mocks.where,
      limit: mocks.rows,
    };
    mocks.where.mockReturnValue(query);
    mocks.join.mockReturnValue(query);
    mocks.select.mockReturnValue(query);
    mocks.session.mockImplementation(async callback =>
      callback({ select: mocks.select }, 'owner-id')
    );
    mocks.limit.mockResolvedValue({ success: true });
    mocks.rows.mockResolvedValue([{ url: 'https://tidal.com/artist/1' }]);
    mocks.source.mockResolvedValue({ status: 'available' });
  });
  it('uses the canonical owner-scoped row URL after the session transaction', async () => {
    expect((await call()).status).toBe(200);
    expect(mocks.limit).toHaveBeenCalledWith('owner-id');
    expect(mocks.where).toHaveBeenCalledTimes(1);
    expect(mocks.source).toHaveBeenCalledWith('https://tidal.com/artist/1');
  });
  it('binds canonical rows to the current owner, an owner claim, and the non-retired surface', async () => {
    await call();
    const dialect = new PgDialect();
    const where = dialect.sqlToQuery(mocks.where.mock.calls[0][0]);
    const claim = dialect.sqlToQuery(mocks.join.mock.calls[0][1]);
    expect(where.sql).toContain('"profile_surfaces"."id" = $1');
    expect(where.params).toEqual([id, 'owner-id']);
    expect(where.sql).toContain('"profile_surfaces"."retired_at" is null');
    expect(where.sql).toContain('"creator_profiles"."user_id" = $2');
    expect(where.sql).toContain('"user_profile_claims"."id" is not null');
    expect(claim.sql).toContain('"user_profile_claims"."user_id" = $1');
    expect(claim.sql).toContain('"user_profile_claims"."role" = $2');
    expect(claim.params).toEqual(['owner-id', 'owner']);
  });
  it('rejects invalid IDs before any DB or outbound read', async () => {
    expect((await call('not-a-uuid')).status).toBe(400);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.source).not.toHaveBeenCalled();
  });
  it('never fetches a row absent from the owner-scoped query', async () => {
    mocks.rows.mockResolvedValue([]);
    expect((await call()).status).toBe(404);
    expect(mocks.source).not.toHaveBeenCalled();
  });
  it('fails closed for unauthenticated sessions', async () => {
    mocks.session.mockRejectedValue(new Error('No session'));
    mocks.unauthorized.mockReturnValue(true);
    expect((await call()).status).toBe(401);
    expect(mocks.source).not.toHaveBeenCalled();
  });
  it('enforces the existing durable limiter before outbound work', async () => {
    mocks.limit.mockResolvedValue({ success: false });
    const response = await call();
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.source).not.toHaveBeenCalled();
  });
  it('reports an unexpected failure without a success receipt', async () => {
    mocks.session.mockRejectedValue(new Error('DB failure'));
    expect((await call()).status).toBe(500);
    expect(mocks.error).toHaveBeenCalled();
  });
});
