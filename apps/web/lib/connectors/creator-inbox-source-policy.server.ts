import 'server-only';

import { and, sql as drizzleSql, notIlike } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { OPERATOR_INBOX_SOURCE_PREFIXES } from './creator-inbox-source-policy';
import { WORKFLOW_CAPTURE_REQUEST_KIND } from './suggested-action-kinds';

/**
 * Apply before selecting payloads or limiting the creator projection.
 *
 * Mirrors `isCreatorInboxSourceKind` semantics exactly: the JS predicate
 * lowercases the kind before comparing, so the SQL mirror must compare
 * case-insensitively too. The exact-kind exclusion goes through `lower()`
 * (a plain `ne` is case-sensitive and would let a case-variant operator row
 * past the SQL filter only for the JS filter to drop it later, splitting
 * the two eligibility definitions); the prefix exclusions stay `notIlike`,
 * which is already case-insensitive.
 */
export function creatorInboxSourceCondition(column: AnyPgColumn) {
  return and(
    drizzleSql`lower(${column}) <> ${WORKFLOW_CAPTURE_REQUEST_KIND}`,
    ...OPERATOR_INBOX_SOURCE_PREFIXES.map(prefix =>
      notIlike(column, `${prefix}%`)
    )
  );
}
