import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { appUserIdFilter } from '@/lib/auth/app-user-id';
import { selectUserSchema } from '@/lib/db/schema/auth';

const WEB_ROOT = resolve(process.cwd());

const APP_ID_SCOPED_SOURCES = [
  {
    relativePath: 'app/app/(shell)/dashboard/audience/audience-data.ts',
    expectedPredicates: 1,
  },
  {
    relativePath: 'app/app/(shell)/dashboard/actions/creator-profile.ts',
    expectedPredicates: 2,
  },
  {
    relativePath: 'app/app/(shell)/dashboard/actions/switch-profile.ts',
    expectedPredicates: 2,
  },
  {
    relativePath: 'app/app/(shell)/dashboard/actions/settings.ts',
    expectedPredicates: 1,
  },
  {
    relativePath: 'app/app/(shell)/admin/actions.ts',
    expectedPredicates: 1,
  },
  {
    relativePath: 'app/api/dashboard/pixels/route.ts',
    expectedPredicates: 3,
  },
] as const;

function readWebSource(relativePath: string): string {
  return readFileSync(resolve(WEB_ROOT, relativePath), 'utf8');
}

describe('post-Better Auth app user ID contract', () => {
  it('accepts a linked post-cutover user without a legacy Clerk ID', () => {
    const postBaUser = selectUserSchema
      .pick({
        id: true,
        clerkId: true,
        betterAuthUserId: true,
      })
      .parse({
        id: '7b4b948f-9720-4c5f-98da-8a7335015da9',
        clerkId: null,
        betterAuthUserId: 'ba_user_post_cutover',
      });

    expect(postBaUser.clerkId).toBeNull();
    expect(postBaUser.betterAuthUserId).toBe('ba_user_post_cutover');
    expect(postBaUser.id).toBe('7b4b948f-9720-4c5f-98da-8a7335015da9');
  });

  it('builds the production ownership predicate against users.id', () => {
    const appUserId = '7b4b948f-9720-4c5f-98da-8a7335015da9';
    const query = new PgDialect().sqlToQuery(appUserIdFilter(appUserId));

    expect(query.sql).toContain('"users"."id" =');
    expect(query.sql).not.toContain('"users"."clerk_id"');
    expect(query.params).toEqual([appUserId]);
  });

  it.each(
    APP_ID_SCOPED_SOURCES
  )('$relativePath uses the tested app-ID predicate', entry => {
    const { expectedPredicates, relativePath } = entry;
    const source = readWebSource(relativePath);

    expect(source.match(/appUserIdFilter\(/g)).toHaveLength(expectedPredicates);
    expect(source).not.toMatch(/eq\(users\.clerkId,\s*\w+\)/);
  });

  it('uses the app UUID for audience subscriber SQL', () => {
    const source = readWebSource(
      'app/app/(shell)/dashboard/audience/audience-data.ts'
    );

    expect(source).toContain('AND u.id = ${appUserId}');
    expect(source).not.toContain('u.clerk_id =');
  });
});
