import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { buildAudienceMembersParams } from '@/lib/queries/audience-infinite';
import { membersQuerySchema } from '@/lib/validation/schemas';

const PROFILE_ID = '22222222-2222-4222-8222-222222222222';

vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: async (op: (tx: unknown, id: string) => unknown) => {
    const builder: Record<string, unknown> = {};
    for (const m of [
      'from',
      'leftJoin',
      'innerJoin',
      'where',
      'orderBy',
      'groupBy',
      'limit',
      'as',
    ]) {
      builder[m] = () => builder;
    }
    builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve([]).then(resolve);
    return op(
      { select: () => builder, execute: async () => ({ rows: [] }) },
      'clerk-1'
    );
  },
}));
vi.mock('@/lib/db/queries/shared', () => ({
  verifyProfileOwnership: async () => ({ id: PROFILE_ID }),
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

async function get(query: string) {
  const { GET } = await import('@/app/api/dashboard/audience/members/route');
  const res = await GET(
    new NextRequest(`http://localhost/api/dashboard/audience/members?${query}`)
  );
  return { status: res.status, body: await res.json() };
}

describe('members API request contract', () => {
  const first = buildAudienceMembersParams({
    profileId: PROFILE_ID,
    view: 'all',
    sort: 'lastSeen',
    direction: 'desc',
    pageSize: 50,
    segments: [],
  });
  const next = buildAudienceMembersParams({
    profileId: PROFILE_ID,
    view: 'identified',
    sort: 'lastSeen',
    direction: 'desc',
    pageSize: 50,
    cursor: 'opaque-cursor',
    segments: ['highIntent', 'alertsOn'],
  });

  it("accepts the client's exact first-page and next-page requests", async () => {
    for (const params of [first, next]) {
      const parsed = membersQuerySchema.safeParse({
        profileId: params.get('profileId'),
        sort: params.get('sort') ?? undefined,
        direction: params.get('direction') ?? undefined,
        cursor: params.get('cursor') ?? undefined,
        page: params.get('page') ?? undefined,
        pageSize: params.get('pageSize') ?? undefined,
        segments: params.getAll('segments'),
      });
      expect(parsed.success).toBe(true);
    }
    const res = await get(first.toString());
    expect(res.status).toBe(200);
    expect(await get(next.toString())).toMatchObject({ status: 200 });
  });

  it('documents the contract: profileId is required, so a bare request is a 400 with a clear error', async () => {
    const res = await get('view=all&limit=50');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid audience request' });
  });

  it('always sends profileId from the client builder', () => {
    expect(first.get('profileId')).toBe(PROFILE_ID);
    expect(next.get('profileId')).toBe(PROFILE_ID);
  });
});
