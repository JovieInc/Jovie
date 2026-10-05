import { sql as drizzleSql, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  join: vi.fn(),
  where: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ db: { select: mocks.select } }));
const { readAccountActivation } = await import('./account-activation');

describe('Bounded account activation read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ leftJoin: mocks.join });
    mocks.join.mockReturnValue({ where: mocks.where });
    mocks.where.mockResolvedValue([]);
  });

  it('does not query an observed empty population', async () => {
    expect(await readAccountActivation([])).toEqual([]);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('rejects scans beyond the canonical cohort bound before database work', async () => {
    await expect(
      readAccountActivation(Array.from({ length: 501 }, (_, i) => `u${i}`))
    ).rejects.toThrow('exceeds cohort bound');
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('uses a single bounded parameterized read and excludes deleted accounts', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const row = {
      id,
      accountStatus: 'waitlist_pending',
      waitlistLinked: true,
      waitlistStatus: 'new',
      attachedOnboardingConversation: false,
      ownedProfileCount: 0,
      claimedProfileCount: 0,
      roleClaimCount: 0,
    };
    mocks.where.mockResolvedValue([row]);
    expect(await readAccountActivation([id, id])).toEqual([row]);
    expect(mocks.select).toHaveBeenCalledTimes(1);
    const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(query.params).toEqual([id]);
    expect(query.sql).toContain('"users"."deleted_at" is null');
    expect(query.sql).not.toContain(id);
  });

  it('binds the waitlist by durable ID, preserving accounts without an entry', async () => {
    await readAccountActivation(['u1']);
    expect(mocks.join).toHaveBeenCalledOnce();
    const join = new PgDialect().sqlToQuery(mocks.join.mock.calls[0][1]);
    expect(join.sql).toBe(
      '"users"."waitlist_entry_id" = "waitlist_entries"."id"'
    );
  });

  it('projects persisted counts without selecting contact data, cookies, tokens or transcripts', async () => {
    await readAccountActivation(['u1']);
    const fields = mocks.select.mock.calls[0][0] as Record<string, SQL>;
    expect(Object.keys(fields).sort()).toEqual(
      [
        'id',
        'accountStatus',
        'waitlistLinked',
        'waitlistStatus',
        'attachedOnboardingConversation',
        'ownedProfileCount',
        'claimedProfileCount',
        'roleClaimCount',
      ].sort()
    );
    const dialect = new PgDialect();
    const projection = Object.values(fields)
      .map(field => dialect.sqlToQuery(drizzleSql`${field}`).sql)
      .join('\n');
    expect(projection).toContain(
      '"chat_conversations"."session_id" is not null'
    );
    expect(projection).toContain('"creator_profiles"."is_claimed" = true');
    expect(projection).toContain(
      '"user_profile_claims"."user_id" = "users"."id"'
    );
    for (const forbidden of ['email', 'claim_token', 'content', 'tool_calls'])
      expect(projection).not.toContain(forbidden);
  });

  it('propagates database failure without replacing it with an empty population', async () => {
    mocks.where.mockRejectedValue(new Error('read failed'));
    await expect(readAccountActivation(['u1'])).rejects.toThrow('read failed');
  });
});
