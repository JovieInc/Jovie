import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./no-users-clerk-id-lookup.js');
const { collectUsersClerkIdLookupViolations, USERS_CLERK_ID_LOOKUP_CEILINGS } =
  rule;

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

const SCAN_ROOTS = ['app', 'lib', 'scripts', 'tests/eval'];

function listSources(rootDir: string): Array<{ file: string; source: string }> {
  const files: Array<{ file: string; source: string }> = [];

  const visit = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.next' || entry === 'dist') {
        continue;
      }
      const fullPath = path.join(dir, entry);
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (
        !/\.(ts|tsx)$/.test(entry) ||
        /\.(test|spec)\.(ts|tsx)$/.test(entry)
      ) {
        continue;
      }
      files.push({
        file: path.relative(appRoot, fullPath).split(path.sep).join('/'),
        source: readFileSync(fullPath, 'utf8'),
      });
    }
  };

  for (const scanRoot of SCAN_ROOTS) {
    visit(path.join(rootDir, scanRoot));
  }

  return files;
}

RuleTester.describe = describe as typeof RuleTester.describe;
RuleTester.it = it as typeof RuleTester.it;

new RuleTester().run('no-users-clerk-id-lookup', rule, {
  valid: [
    'eq(users.id, appUserId)',
    'eq(creatorProfiles.userId, appUserId)',
    {
      filename: '/repo/apps/web/lib/db/queries/shared.ts',
      code: 'eq(users.clerkId, userIdentity)',
    },
    {
      filename:
        '/repo/apps/web/app/api/dashboard/releases/[releaseId]/analytics/route.ts',
      code: 'eq(users.clerkId, userIdentity)',
    },
  ],
  invalid: [
    {
      filename: '/repo/apps/web/app/api/dashboard/shop/route.ts',
      code: 'eq(users.clerkId, appUserId)',
      errors: [{ messageId: 'noClerkIdLookup' }],
    },
    {
      filename: '/repo/apps/web/lib/waitlist/redeem.ts',
      code: 'db.select().from(users).where(eq(users.clerkId, userId))',
      errors: [{ messageId: 'noClerkIdLookup' }],
    },
  ],
});

describe('users.clerkId lookup ceiling', () => {
  it('matches the checked-in source and rejects a new call site', () => {
    expect(collectUsersClerkIdLookupViolations(listSources(appRoot))).toEqual(
      []
    );

    const planted = collectUsersClerkIdLookupViolations([
      {
        file: 'app/api/example/route.ts',
        source: 'eq(users.clerkId, appUserId)',
      },
    ]);
    expect(planted).toEqual([
      { file: 'app/api/example/route.ts', count: 1, allowed: 0 },
    ]);
  });

  it('rejects a second lookup inside an allowlisted legacy file', () => {
    const planted = collectUsersClerkIdLookupViolations(
      [
        {
          file: 'lib/db/queries/shared.ts',
          source: 'eq(users.clerkId, a)\neq(users.clerkId, b)',
        },
      ],
      USERS_CLERK_ID_LOOKUP_CEILINGS
    );

    expect(planted).toEqual([
      {
        file: 'lib/db/queries/shared.ts',
        count: 2,
        allowed: USERS_CLERK_ID_LOOKUP_CEILINGS['lib/db/queries/shared.ts'],
      },
    ]);
  });
});
