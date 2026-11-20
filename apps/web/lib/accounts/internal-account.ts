import { sql as drizzleSql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { users } from '@/lib/db/schema/auth';
import {
  INTERNAL_ACCOUNT_EMAIL_SQL_PATTERN,
  isInternalOrTestAccountEmail,
} from '@/lib/utils/email';
import { ACCOUNT_CLASSES, type AccountClass } from './account-class';

/**
 * The one classifier for "is this account a customer?". Every company metric
 * (Summer, Ovie, admin dashboards, funnels, revenue) must exclude internal
 * accounts through the helpers here, never with a hand-written pattern.
 *
 * An account is internal when EITHER
 *   1. its email matches the rules in `lib/utils/email.ts` (team domains,
 *      founder domain, dogfood/QA domains, `+clerk_test`, `+synthetic-`,
 *      `+canary`, `+e2e`, `+prodcert`, `+dogfood` tags), OR
 *   2. `users.account_class` is set (stamped at creation, or by an operator
 *      for accounts whose address carries no tag).
 * The email rules stay live so a tag added later takes effect on old rows.
 */

/** Header a harness (E2E, production certification, agent) sends to mark the account it creates. */
export const ACCOUNT_CLASS_HEADER = 'x-jovie-account-class';

export function parseAccountClass(
  value: string | null | undefined
): AccountClass | null {
  const normalized = value?.trim().toLowerCase();
  return (
    ACCOUNT_CLASSES.find(accountClass => accountClass === normalized) ?? null
  );
}

/**
 * Class to stamp on a brand-new user: an explicit harness header wins, then the
 * email rules, otherwise null (customer). Pure so every insert site can call it.
 */
export function resolveNewAccountClass(input: {
  email: string | null | undefined;
  header?: string | null;
}): AccountClass | null {
  const fromHeader = parseAccountClass(input.header);
  if (fromHeader) return fromHeader;
  return isInternalOrTestAccountEmail(input.email) ? 'internal' : null;
}

/** JS twin of `internalAccountSql` for rows already in memory. */
export function isInternalAccount(account: {
  email: string | null | undefined;
  accountClass?: AccountClass | string | null;
}): boolean {
  return (
    parseAccountClass(account.accountClass) !== null ||
    isInternalOrTestAccountEmail(account.email)
  );
}

/**
 * SQL predicate: the account is internal. Defaults to the Drizzle `users`
 * table; raw-SQL callers pass their own column references, e.g.
 * `internalAccountSql(sql.raw('u.email'), sql.raw('u.account_class'))`.
 */
export function internalAccountSql(
  email: SQL | AnyPgColumn = users.email,
  accountClass: SQL | AnyPgColumn = users.accountClass
): SQL {
  return drizzleSql`(${accountClass} is not null or lower(${email}) ~* ${INTERNAL_ACCOUNT_EMAIL_SQL_PATTERN})`;
}

/** SQL predicate: the account is a customer. A null email is unclassifiable, so it counts as external. */
export function externalAccountSql(
  email: SQL | AnyPgColumn = users.email,
  accountClass: SQL | AnyPgColumn = users.accountClass
): SQL {
  return drizzleSql`(${accountClass} is null and (${email} is null or lower(${email}) !~* ${INTERNAL_ACCOUNT_EMAIL_SQL_PATTERN}))`;
}

/**
 * SQL predicate for tables that only carry an email (waitlist entries, Stripe
 * customers matched by email): the email rules alone, no account_class.
 */
export function internalEmailSql(email: SQL | AnyPgColumn): SQL {
  return drizzleSql`(lower(btrim(${email})) ~* ${INTERNAL_ACCOUNT_EMAIL_SQL_PATTERN})`;
}

/**
 * SQL predicate for rows scoped to a creator profile (clicks, audience,
 * subscriptions, releases): the profile is NOT owned by an internal account.
 * Unowned profiles stay counted, so public fan traffic on unclaimed profiles
 * is not discarded. `profileId` is the row's creator_profile_id column.
 */
export function notInternalProfileSql(profileId: SQL | AnyPgColumn): SQL {
  // The owner is resolved in a scalar subquery so the only tables in scope are
  // internal_cp and internal_u; neither has a creator_profile_id column, which
  // lets single-table callers pass an unqualified drizzleSql.raw('creator_profile_id').
  return drizzleSql`not exists (
    select 1 from creator_profiles internal_cp
    join users internal_u
      on internal_u.id = coalesce(
        (select ic.user_id from user_profile_claims ic
          where ic.creator_profile_id = internal_cp.id and ic.role = 'owner'
          limit 1),
        internal_cp.user_id)
    where internal_cp.id = ${profileId}
      and ${internalAccountSql(
        drizzleSql.raw('internal_u.email'),
        drizzleSql.raw('internal_u.account_class')
      )}
  )`;
}
