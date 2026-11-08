import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  values: vi.fn(),
  conflict: vi.fn(),
  returning: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  db: { insert: () => ({ values: mocks.values }) },
}));
vi.mock('@/lib/waitlist/signup-entry', () => ({
  hashEmailForWaitlist: () => 'private-hash',
}));

import { joinWaitlistWithRole } from './role-entry';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.values.mockReturnValue({ onConflictDoUpdate: mocks.conflict });
  mocks.conflict.mockReturnValue({ returning: mocks.returning });
  mocks.returning.mockResolvedValue([{ created: true }]);
});
describe('role waitlist persistence', () => {
  it('stores normalized general context and a machine timestamp without creating an account', async () => {
    const now = new Date('2026-11-02T11:00:00Z');
    expect(
      await joinWaitlistWithRole({
        email: ' Alex@Example.com ',
        role: 'team',
        name: ' Alex Example ',
        now,
      })
    ).toEqual({ created: true });
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        emailNormalized: 'alex@example.com',
        status: 'waitlisted',
        waitlistedAt: now,
        qualificationInputs: {
          role: 'team',
          roleCapturedAt: now.toISOString(),
          name: 'Alex Example',
        },
      })
    );
    const dialect = new PgDialect();
    const conflict = mocks.conflict.mock.calls[0][0];
    const query = dialect.sqlToQuery(conflict.set.qualificationInputs);
    expect(query.sql).toContain(
      `coalesce("waitlist_entries"."qualification_inputs"->>'role'`
    );
    expect(query.sql).toContain("->>'name' is null");
    expect(query.params).toContain('Alex Example');
  });
  it('retains the specialist form payload when no name is provided', async () => {
    await joinWaitlistWithRole({ email: 'person@example.com', role: 'artist' });
    expect(
      mocks.values.mock.calls[0][0].qualificationInputs
    ).not.toHaveProperty('name');
  });
  it('answers an existing entry without claiming a new account or join', async () => {
    mocks.returning.mockResolvedValue([]);
    expect(
      await joinWaitlistWithRole({
        email: 'person@example.com',
        role: 'individual',
      })
    ).toEqual({ created: false });
  });
  it('propagates persistence failure and rejects an unusable email', async () => {
    mocks.returning.mockRejectedValue(new Error('storage unavailable'));
    await expect(
      joinWaitlistWithRole({
        email: 'person@example.com',
        role: 'organization',
      })
    ).rejects.toThrow('storage unavailable');
    mocks.values.mockClear();
    await expect(
      joinWaitlistWithRole({ email: ' ', role: 'other' })
    ).rejects.toThrow('valid email');
    expect(mocks.values).not.toHaveBeenCalled();
  });
});
