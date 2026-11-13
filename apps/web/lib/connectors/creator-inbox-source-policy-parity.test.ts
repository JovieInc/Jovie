import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { suggestedActions } from '@/lib/db/schema/connectors';
import { isCreatorInboxSourceKind } from './creator-inbox-source-policy';
import { creatorInboxSourceCondition } from './creator-inbox-source-policy.server';

/**
 * Evaluates the eligibility SQL the policy actually emits against an
 * in-memory kind. Clause shapes are located in the compiled SQL at
 * evaluation time (and asserted present), so a clause dropped or weakened
 * in production SQL changes the verdict here instead of passing silently.
 */
function sqlAdmitsKind(kind: string): boolean {
  const condition = creatorInboxSourceCondition(suggestedActions.kind);
  expect(condition).toBeDefined();
  const query = new PgDialect().sqlToQuery(condition!);

  // Exact-kind exclusion, case-insensitive (lower()) or case-sensitive (plain
  // <>): the two forms never co-match because the lower() form separates the
  // column from the operator with a closing paren.
  const insensitive = /lower\("suggested_actions"\."kind"\) <> \$(\d+)/.exec(
    query.sql
  );
  const sensitive = /"suggested_actions"\."kind" <> \$(\d+)/.exec(query.sql);
  const exact = insensitive ?? sensitive;
  expect(exact, 'emitted SQL carries an exact-kind exclusion').not.toBeNull();
  const exactValue = String(query.params[Number(exact![1]) - 1]);
  const kindMatchesExact = insensitive
    ? kind.toLowerCase() === exactValue.toLowerCase()
    : kind === exactValue;
  if (kindMatchesExact) return false;

  // Operator-prefix exclusions: "kind" not ilike $n with a trailing-% param.
  const prefixes = [
    ...query.sql.matchAll(/"suggested_actions"\."kind" not ilike \$(\d+)/g),
  ];
  expect(prefixes.length).toBeGreaterThan(0);
  for (const match of prefixes) {
    const pattern = String(query.params[Number(match[1]) - 1]);
    expect(pattern.endsWith('%')).toBe(true);
    if (kind.toLowerCase().startsWith(pattern.slice(0, -1).toLowerCase())) {
      return false;
    }
  }
  return true;
}

describe('creator inbox source policy SQL/JS parity', () => {
  it.each([
    // Creator and ambiguous legacy kinds stay admitted.
    'calendar.create_event',
    'social_reply.draft',
    'healthcheck.legacy_customer',
    'creator.suggestion',
    // Operator provenance stays excluded — including case variants, which a
    // case-sensitive SQL clause would admit while the JS predicate drops.
    'founder.brain_dump',
    'FOUNDER.review',
    'Founder.Review',
    'ops.healthcheck',
    'OPS.Healthcheck',
    'ovie.queue',
    'workflow_capture.request',
    'WORKFLOW_CAPTURE.REQUEST',
    'Workflow_Capture.Request',
    // Bare words are not prefixed members and must stay admitted on both sides.
    'founder',
    'ops',
    'opsx.a',
  ])('SQL and JS agree on %s', kind => {
    expect(sqlAdmitsKind(kind)).toBe(isCreatorInboxSourceKind(kind));
  });
});
