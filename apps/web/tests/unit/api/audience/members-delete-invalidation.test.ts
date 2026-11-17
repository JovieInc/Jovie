import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PROFILE_ID = '22222222-2222-4222-8222-222222222222';
const MEMBER_ID = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => ({
  deleted: [] as { id: string }[],
  owned: true,
  committed: false,
  revalidateTag: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidateTag: mocks.revalidateTag }));
vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: async (op: (tx: unknown, id: string) => unknown) => {
    const result = await op(
      {
        delete: () => ({
          where: () => ({ returning: async () => mocks.deleted }),
        }),
      },
      'clerk-1'
    );
    mocks.committed = true;
    return result;
  },
}));
vi.mock('@/lib/db/queries/shared', () => ({
  verifyProfileOwnership: async () => (mocks.owned ? { id: PROFILE_ID } : null),
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

async function remove() {
  const { DELETE } = await import('@/app/api/dashboard/audience/members/route');
  return DELETE(
    new NextRequest('http://localhost/api/dashboard/audience/members', {
      method: 'DELETE',
      body: JSON.stringify({ memberId: MEMBER_ID, profileId: PROFILE_ID }),
      headers: { 'content-type': 'application/json' },
    })
  );
}

describe('DELETE /api/dashboard/audience/members cache invalidation', () => {
  beforeEach(() => {
    mocks.deleted = [{ id: MEMBER_ID }];
    mocks.owned = true;
    mocks.committed = false;
    mocks.revalidateTag.mockReset();
  });

  it("expires the profile's audience cache after the delete commits", async () => {
    mocks.revalidateTag.mockImplementation(() => {
      expect(mocks.committed).toBe(true);
    });
    const res = await remove();

    expect(res.status).toBe(200);
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(1);
    expect(mocks.revalidateTag).toHaveBeenCalledWith(
      `audience-data:${PROFILE_ID}`,
      { expire: 0 }
    );
  });

  it('leaves the cache alone when nothing was deleted', async () => {
    mocks.deleted = [];
    expect((await remove()).status).toBe(404);
    mocks.owned = false;
    expect((await remove()).status).toBe(404);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });
});
