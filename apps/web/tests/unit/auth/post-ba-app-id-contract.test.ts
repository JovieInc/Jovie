import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { selectUserSchema } from '@/lib/db/schema/auth';

const WEB_ROOT = resolve(process.cwd());

const APP_ID_SCOPED_SOURCES = [
  'app/app/(shell)/dashboard/audience/audience-data.ts',
  'app/app/(shell)/dashboard/actions/creator-profile.ts',
  'app/app/(shell)/dashboard/actions/switch-profile.ts',
  'app/app/(shell)/dashboard/actions/settings.ts',
  'app/app/(shell)/admin/actions.ts',
  'app/api/dashboard/pixels/route.ts',
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

  it.each(
    APP_ID_SCOPED_SOURCES
  )('%s never compares the authenticated app UUID to users.clerkId', relativePath => {
    const source = readWebSource(relativePath);

    expect(source).not.toMatch(/eq\(users\.clerkId,\s*\w+\)/);
  });

  it('uses users.id for audience ownership in both Drizzle and subscriber SQL', () => {
    const source = readWebSource(
      'app/app/(shell)/dashboard/audience/audience-data.ts'
    );

    expect(source).toContain('eq(users.id, appUserId)');
    expect(source).toContain('AND u.id = ${appUserId}');
    expect(source).not.toContain('u.clerk_id =');
  });
});
