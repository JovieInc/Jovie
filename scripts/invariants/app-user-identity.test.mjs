import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  auditSources,
  findDirectLegacyPredicates,
  findLegacyHelperCalls,
} from './app-user-identity.mjs';

describe('authenticated app-user identity invariant', () => {
  it('deliberate red: rejects a changed route that compares a session ID with users.clerkId', () => {
    const path = 'apps/web/app/api/example/route.ts';
    const result = auditSources({
      sources: {
        [path]: '.where(eq(users.clerkId, sessionUserId))',
      },
      changedPaths: [path],
      approvedLegacyAdapters: {},
      legacyDebtBaseline: {},
    });

    assert.equal(result.violations.length, 1);
    assert.match(result.violations[0].reason, /unapproved direct legacy/);
  });

  it('accepts the canonical app-user predicate', () => {
    const path = 'apps/web/lib/example.ts';
    const result = auditSources({
      sources: {
        [path]: '.where(appUserIdFilter(appUserId))',
      },
      changedPaths: [path],
      approvedLegacyAdapters: {},
      legacyDebtBaseline: {},
    });

    assert.deepEqual(result.violations, []);
  });

  it('deliberate red: rejects passing an app UUID to the legacy billing helper', () => {
    const path = 'apps/web/lib/stripe/customer-sync/customer.ts';
    const result = auditSources({
      sources: {
        [path]: `
          import { fetchUserBillingData as fetchLegacy } from './queries';
          await fetchLegacy({ clerkUserId: appUserId });
        `,
      },
      changedPaths: [path],
      approvedLegacyAdapters: {},
      approvedLegacyHelperCallers: {},
      legacyDebtBaseline: {},
    });

    assert.equal(result.violations.length, 1);
    assert.match(result.violations[0].reason, /legacy billing helper/);
    assert.equal(
      findLegacyHelperCalls(
        `import { fetchUserBillingData as fetchLegacy } from './queries';\nfetchLegacy({ clerkUserId: appUserId });`
      ).length,
      1
    );
  });

  it('ratchets existing whole-repo debt and requires touched files to migrate', () => {
    const path = 'apps/web/lib/legacy.ts';
    const source = '.where(eq(users.clerkId, legacyNamedButSessionDerivedId))';
    const unchanged = auditSources({
      sources: { [path]: source },
      changedPaths: [],
      approvedLegacyAdapters: {},
      legacyDebtBaseline: { [path]: 1 },
    });
    const changed = auditSources({
      sources: { [path]: source },
      changedPaths: [path],
      approvedLegacyAdapters: {},
      legacyDebtBaseline: { [path]: 1 },
    });

    assert.deepEqual(unchanged.violations, []);
    assert.equal(changed.violations.length, 1);
    assert.match(
      changed.violations[0].reason,
      /changed authenticated server code/
    );
  });

  it('allows bounded explicit legacy adapters but rejects growth', () => {
    const path = 'apps/web/lib/auth/legacy-adapter.ts';
    const oneLookup = '.where(eq(users.clerkId, explicitLegacyClerkId))';
    const twoLookups = `${oneLookup}\n${oneLookup}`;

    assert.deepEqual(
      auditSources({
        sources: { [path]: oneLookup },
        changedPaths: [path],
        approvedLegacyAdapters: { [path]: 1 },
        legacyDebtBaseline: {},
      }).violations,
      []
    );
    assert.match(
      auditSources({
        sources: { [path]: twoLookups },
        changedPaths: [path],
        approvedLegacyAdapters: { [path]: 1 },
        legacyDebtBaseline: {},
      }).violations[0].reason,
      /approved legacy adapter grew/
    );
  });

  it('allows only bounded explicit callers of the legacy billing helper', () => {
    const path = 'apps/web/lib/stripe/customer-sync/billing-info.ts';
    const queryImport = "import { fetchUserBillingData } from './queries';";
    const call = 'fetchUserBillingData({ clerkUserId });';
    const oneCall = `${queryImport}\n${call}`;
    const twoCalls = `${queryImport}\n${call}\n${call}`;

    assert.deepEqual(
      auditSources({
        sources: { [path]: oneCall },
        approvedLegacyAdapters: {},
        approvedLegacyHelperCallers: { [path]: 1 },
        legacyDebtBaseline: {},
      }).violations,
      []
    );
    assert.match(
      auditSources({
        sources: { [path]: twoCalls },
        approvedLegacyAdapters: {},
        approvedLegacyHelperCallers: { [path]: 1 },
        legacyDebtBaseline: {},
      }).violations[0].reason,
      /approved legacy billing helper caller grew/
    );
  });

  it('ignores unrelated local functions that share the legacy helper name', () => {
    assert.deepEqual(
      findLegacyHelperCalls(
        'function fetchUserBillingData() {}\nfetchUserBillingData();',
        'apps/web/lib/unrelated.ts'
      ),
      []
    );
  });

  it('detects aliased predicates, raw SQL, and code after a block comment', () => {
    const findings = findDirectLegacyPredicates(
      [
        'const authUsers = users;',
        'inArray(authUsers.clerkId, candidateIds);',
        "const aliased = alias(users, 'users_alias');",
        "drizzleSql`${aliased['clerkId']} = ${sessionId}`;",
        '/* reviewed migration */ eq(users.clerkId, sessionId);',
      ].join('\n')
    );

    assert.equal(findings.length, 3);
  });

  it('ignores documentation examples, strings, and comments', () => {
    const findings = findDirectLegacyPredicates(`
      /** .where(eq(users.clerkId, oldExample)) */
      // .where(eq(users.clerkId, oldExample))
      const example = '.where(eq(users.clerkId, oldExample))';
      appUserIdFilter(appUserId); // eq(users.clerkId, oldExample)
      .where(appUserIdFilter(appUserId))
    `);

    assert.deepEqual(findings, []);
  });

  it('allows legacy-field presence checks that do not compare ownership', () => {
    assert.deepEqual(
      findDirectLegacyPredicates(
        [
          'and(isNotNull(users.stripeCustomerId), isNotNull(users.clerkId));',
          'drizzleSql`${users.clerkId} IS NOT NULL`;',
        ].join('\n')
      ),
      []
    );
  });
});
