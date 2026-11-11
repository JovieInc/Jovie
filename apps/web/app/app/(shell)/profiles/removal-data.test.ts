import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { socialLinks } from '@/lib/db/schema/links';
import { loadPresenceRemovalLinks } from './removal-data';

const mock = vi.hoisted(() => ({
  owner: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: { select: mock.select } }));
vi.mock('@/lib/db/queries/shared', () => ({
  getAuthenticatedProfile: mock.owner,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mock.select.mockReturnValue({ from: mock.from });
  mock.from.mockReturnValue({ where: mock.where });
});
describe('authenticated Presence removal projection', () => {
  it('does not read links when the actor does not own the requested profile', async () => {
    mock.owner.mockResolvedValue(null);
    expect(await loadPresenceRemovalLinks('profile', 'actor')).toEqual([]);
    expect(mock.owner).toHaveBeenCalledWith(
      expect.anything(),
      'profile',
      'actor'
    );
    expect(mock.select).not.toHaveBeenCalled();
  });
  it('reads only minimal active link fields bound to the authenticated profile', async () => {
    mock.owner.mockResolvedValue({ id: 'profile' });
    mock.where.mockResolvedValue([]);
    await loadPresenceRemovalLinks('profile', 'actor');
    expect(Object.keys(mock.select.mock.calls[0][0]).sort()).toEqual([
      'creatorProfileId',
      'id',
      'isActive',
      'state',
      'url',
      'version',
    ]);
    expect(mock.from).toHaveBeenCalledWith(socialLinks);
    const query = new PgDialect().sqlToQuery(mock.where.mock.calls[0][0]);
    expect(query.params).toEqual(['profile', true, 'active']);
    expect(query.sql).toContain('creator_profile_id');
  });
});
