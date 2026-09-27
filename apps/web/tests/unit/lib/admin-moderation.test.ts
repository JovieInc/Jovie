import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  invalidateProfileCache: vi.fn(),
  selectQueue: [] as unknown[][],
  updateQueue: [] as unknown[][],
  updateCalls: [] as { table: unknown; set: Record<string, unknown> }[],
  insertValues: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.select,
    update: hoisted.update,
    insert: hoisted.insert,
  },
}));

vi.mock('@/lib/cache/profile', () => ({
  invalidateProfileCache: hoisted.invalidateProfileCache,
}));

import {
  applyModerationTakedown,
  listAbuseReports,
} from '@/lib/admin/moderation';
import { wrappedLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';

const whereResult = (value: unknown[]) =>
  Object.assign(Promise.resolve(value), {
    limit: () => Promise.resolve(value),
    orderBy: () => ({ limit: () => Promise.resolve(value) }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.selectQueue = [];
  hoisted.updateQueue = [];
  hoisted.updateCalls = [];
  hoisted.insertValues = [];

  hoisted.select.mockImplementation(() => ({
    from: () => ({
      where: () => whereResult(hoisted.selectQueue.shift() ?? []),
    }),
  }));

  hoisted.update.mockImplementation((table: unknown) => ({
    set: (set: Record<string, unknown>) => {
      hoisted.updateCalls.push({ table, set });
      return {
        where: () =>
          Object.assign(Promise.resolve(undefined), {
            returning: () => Promise.resolve(hoisted.updateQueue.shift() ?? []),
          }),
      };
    },
  }));

  hoisted.insert.mockImplementation(() => ({
    values: (values: Record<string, unknown>) => {
      hoisted.insertValues.push(values);
      return Promise.resolve(undefined);
    },
  }));
});

const ADMIN = 'admin-1';

describe('applyModerationTakedown', () => {
  it('expires a wrapped link by shortId and resolves matching reports', async () => {
    hoisted.updateQueue.push([{ id: 'l1' }, { id: 'l2' }], [{ id: 'r1' }]);

    const result = await applyModerationTakedown({
      adminUserId: ADMIN,
      targetType: 'wrapped_link',
      target: 'abc123',
    });

    expect(result.wrappedLinksDisabled).toBe(2);
    expect(result.reportsResolved).toBe(1);
    expect(hoisted.updateCalls[0]?.table).toBe(wrappedLinks);
    expect(hoisted.updateCalls[0]?.set.expiresAt).toBeInstanceOf(Date);
    expect(hoisted.select).not.toHaveBeenCalled();
    expect(hoisted.insertValues[0]).toMatchObject({
      adminUserId: ADMIN,
      action: 'moderation_takedown',
      metadata: expect.objectContaining({ target: 'abc123' }),
    });
  });

  it('unpublishes a profile and expires owner wrapped links', async () => {
    hoisted.selectQueue.push(
      [{ id: 'prof-1', userId: 'owner-1', usernameNormalized: 'badhandle' }],
      [{ userId: 'claimant-1' }]
    );
    hoisted.updateQueue.push([{ id: 'l1' }], [{ id: 'r1' }]);

    const result = await applyModerationTakedown({
      adminUserId: ADMIN,
      targetType: 'profile',
      target: '@BadHandle',
      reportId: '11111111-1111-4111-8111-111111111111',
      reason: 'impersonation',
    });

    expect(result.profileId).toBe('prof-1');
    expect(result.wrappedLinksDisabled).toBe(1);
    const profileUpdate = hoisted.updateCalls.find(
      c => c.table === creatorProfiles
    );
    expect(profileUpdate?.set.isPublic).toBe(false);
    expect(hoisted.invalidateProfileCache).toHaveBeenCalledWith('badhandle');
    expect(hoisted.insertValues[0]).toMatchObject({
      metadata: expect.objectContaining({ profileId: 'prof-1' }),
    });
  });

  it('resolves smart_link slugs and leaves page targets untouched', async () => {
    hoisted.selectQueue.push(
      [{ id: 'prof-9', userId: null, usernameNormalized: 'x' }],
      []
    );
    hoisted.updateQueue.push([], []);

    const smart = await applyModerationTakedown({
      adminUserId: ADMIN,
      targetType: 'smart_link',
      target: 'release-slug--prof-9',
    });
    expect(smart.profileId).toBe('prof-9');

    hoisted.updateQueue.push([]);
    const page = await applyModerationTakedown({
      adminUserId: ADMIN,
      targetType: 'page',
      target: '/some/page',
    });
    expect(page.reportsResolved).toBe(0);
    expect(hoisted.insertValues).toHaveLength(2);
  });
});

it('listAbuseReports returns pending abuse reports', async () => {
  hoisted.selectQueue.push([{ id: 'r1', status: 'pending' }]);

  const rows = await listAbuseReports(10);
  expect(rows).toEqual([{ id: 'r1', status: 'pending' }]);
  expect(hoisted.select).toHaveBeenCalled();
});
