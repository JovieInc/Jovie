/**
 * Ban new `eq(users.clerkId, ...)` lookups. Session helpers return `users.id`.
 * Ceilings are the legacy-compat reader and external/legacy id callers.
 * The unit test fails when an allowlisted file gains a match.
 */

const USERS_CLERK_ID_LOOKUP_PATTERN = /eq\(\s*users\.clerkId\s*,/g;

/** Max allowed matches. Absent files must stay at zero. */
const USERS_CLERK_ID_LOOKUP_CEILINGS = {
  'lib/db/queries/shared.ts': 1,
  'lib/auth/dev-test-auth.server.ts': 1,
  'lib/auth/native-test-clerk-user.server.ts': 1,
  'lib/leads/funnel-events.ts': 2,
  'lib/notifications/preferences.ts': 1,
  'lib/stripe/customer-sync/queries.ts': 2,
  'lib/stripe/dunning.ts': 1,
  'lib/testing/test-user-provision.server.ts': 2,
  'app/api/dashboard/releases/[releaseId]/analytics/route.ts': 1,
  'scripts/seed-demo-account.ts': 1,
  'tests/eval/promptfoo/jovie-chat-provider.ts': 1,
};

function normalizePath(filename) {
  return filename.replaceAll('\\', '/');
}

function ceilingFor(filename) {
  const normalized = normalizePath(filename);
  for (const [suffix, ceiling] of Object.entries(
    USERS_CLERK_ID_LOOKUP_CEILINGS
  )) {
    if (normalized.endsWith(suffix)) return ceiling;
  }
  return 0;
}

function isUsersClerkIdLookup(node) {
  if (node.type !== 'CallExpression' || node.arguments.length < 1) return false;
  const callee = node.callee;
  if (callee.type !== 'Identifier' || callee.name !== 'eq') return false;
  const column = node.arguments[0];
  return (
    column.type === 'MemberExpression' &&
    !column.computed &&
    column.object.type === 'Identifier' &&
    column.object.name === 'users' &&
    column.property.type === 'Identifier' &&
    column.property.name === 'clerkId'
  );
}

function findUsersClerkIdLookups(source) {
  return [...source.matchAll(USERS_CLERK_ID_LOOKUP_PATTERN)].map(match => ({
    index: match.index ?? 0,
  }));
}

function collectUsersClerkIdLookupViolations(
  files,
  ceilings = USERS_CLERK_ID_LOOKUP_CEILINGS
) {
  const violations = [];
  for (const file of files) {
    const count = findUsersClerkIdLookups(file.source).length;
    const allowed = ceilings[file.file] ?? 0;
    if (count > allowed) {
      violations.push({ file: file.file, count, allowed });
    }
  }
  return violations;
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow eq(users.clerkId, ...) outside the legacy identity allowlist',
      recommended: true,
    },
    messages: {
      noClerkIdLookup:
        'Look up session users with eq(users.id, appUserId). eq(users.clerkId, ...) misses Better Auth rows whose clerk_id is null. Legacy external ids belong in getUserByIdentity or the documented allowlist.',
    },
    schema: [],
  },
  create(context) {
    if (ceilingFor(context.filename) > 0) return {};
    return {
      CallExpression(node) {
        if (!isUsersClerkIdLookup(node)) return;
        context.report({ node, messageId: 'noClerkIdLookup' });
      },
    };
  },
};

module.exports = rule;
module.exports.USERS_CLERK_ID_LOOKUP_CEILINGS = USERS_CLERK_ID_LOOKUP_CEILINGS;
module.exports.USERS_CLERK_ID_LOOKUP_PATTERN = USERS_CLERK_ID_LOOKUP_PATTERN;
module.exports.findUsersClerkIdLookups = findUsersClerkIdLookups;
module.exports.collectUsersClerkIdLookupViolations =
  collectUsersClerkIdLookupViolations;
module.exports.ceilingFor = ceilingFor;
