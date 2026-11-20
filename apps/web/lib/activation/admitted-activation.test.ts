import { sql as drizzleSql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  ADMITTED_USER_STATUSES,
  activatedUserSql,
  admittedUserSql,
  isAdmittedUserStatus,
} from './admitted-activation';

const dialect = new PgDialect();

describe('admitted users', () => {
  it('are the statuses from waitlist approval through active', () => {
    expect([...ADMITTED_USER_STATUSES].sort()).toEqual(
      [
        'active',
        'onboarding_incomplete',
        'profile_claimed',
        'waitlist_approved',
      ].sort()
    );
  });

  it('exclude the waitlist and blocked accounts', () => {
    expect(isAdmittedUserStatus('waitlist_pending')).toBe(false);
    expect(isAdmittedUserStatus('suspended')).toBe(false);
    expect(isAdmittedUserStatus('banned')).toBe(false);
    expect(isAdmittedUserStatus(null)).toBe(false);
    expect(isAdmittedUserStatus('active')).toBe(true);
  });

  it('render as a parameterized status predicate', () => {
    const query = dialect.sqlToQuery(
      admittedUserSql(drizzleSql.raw('u.user_status'))
    );
    expect(query.sql).toContain('u.user_status::text IN (');
    expect(query.params).toEqual([...ADMITTED_USER_STATUSES]);
  });
});

describe('activated users', () => {
  it('own a profile that finished onboarding', () => {
    const query = dialect.sqlToQuery(activatedUserSql(drizzleSql.raw('bu.id')));
    expect(query.sql).toContain('cp.user_id = bu.id');
    expect(query.sql).toContain('cp.onboarding_completed_at IS NOT NULL');
  });
});
