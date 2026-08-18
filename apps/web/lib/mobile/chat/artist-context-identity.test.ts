import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveProfileAccess } from '@/lib/auth/profile-access';

const ARTIST_CONTEXT_SOURCE = readFileSync(
  resolve(process.cwd(), 'lib/mobile/chat/artist-context.ts'),
  'utf8'
);
const TURN_HANDLER_SOURCE = readFileSync(
  resolve(process.cwd(), 'lib/mobile/chat/turn-handler.ts'),
  'utf8'
);
const SESSION_AUTH_SOURCE = readFileSync(
  resolve(process.cwd(), 'lib/mobile/session-auth.ts'),
  'utf8'
);

const APP_USER_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000002';
const PROFILE_ID = '00000000-0000-4000-8000-000000000010';
const BETTER_AUTH_OR_CLERK_ID = 'user_2abcdefghijklmnopqrstuvwxyz';

describe('mobile chat artist-context identity contract', () => {
  it('authorizes with the app user UUID, not users.clerkId', () => {
    expect(ARTIST_CONTEXT_SOURCE).toContain('getExactProfileAccess');
    expect(ARTIST_CONTEXT_SOURCE).toContain('input.appUserId');
    expect(ARTIST_CONTEXT_SOURCE).toContain('input.profileId');
    expect(ARTIST_CONTEXT_SOURCE).toContain('if (!access.ok)');
    expect(ARTIST_CONTEXT_SOURCE).not.toContain('users.clerkId');
    expect(ARTIST_CONTEXT_SOURCE).not.toContain('userClerkId');
    expect(ARTIST_CONTEXT_SOURCE).not.toContain('clerkUserId');
    expect(ARTIST_CONTEXT_SOURCE).not.toContain('leftJoin(users');
  });

  it('passes the resolved session app user id into artist-context load', () => {
    expect(TURN_HANDLER_SOURCE).toMatch(
      /fetchMobileArtistContext\(\{\s*profileId,\s*appUserId: session\.user\.id,\s*\}\)/
    );
  });

  it('keeps the Better Auth mobile session mapped to users.id', () => {
    expect(SESSION_AUTH_SOURCE).toContain('getAppUserByBetterAuthId');
    expect(SESSION_AUTH_SOURCE).toContain('return appUser?.id ?? null');
  });

  it('fails closed when the app UUID is compared to the legacy identity column', () => {
    // JOV-5205: getMobileSessionUserId returns users.id. The previous mobile
    // loader compared that UUID to users.clerkId and returned null on every
    // authenticated iOS turn, which the turn handler surfaces as
    // ARTIST_CONTEXT_UNAVAILABLE.
    const appUserId: string = APP_USER_ID;
    const clerkId: string | null = BETTER_AUTH_OR_CLERK_ID;
    expect(appUserId === clerkId).toBe(false);
    expect(ARTIST_CONTEXT_SOURCE).not.toMatch(
      /userClerkId\s*!==\s*input\.clerkUserId/
    );
  });

  it.each([
    { role: 'owner', name: 'canonical owner' },
    { role: 'manager', name: 'canonical manager' },
  ])('authorizes a $name even when the legacy owner differs', ({ role }) => {
    expect(
      resolveProfileAccess({
        appUserId: APP_USER_ID,
        profileId: PROFILE_ID,
        userRows: [{ id: APP_USER_ID }],
        profileRows: [{ id: PROFILE_ID, legacyUserId: OTHER_USER_ID }],
        claimRows: [{ userId: APP_USER_ID, role }],
      })
    ).toMatchObject({ ok: true, profileId: PROFILE_ID });
  });

  it('denies a stale legacy owner after canonical ownership transfers', () => {
    expect(
      resolveProfileAccess({
        appUserId: APP_USER_ID,
        profileId: PROFILE_ID,
        userRows: [{ id: APP_USER_ID }],
        profileRows: [{ id: PROFILE_ID, legacyUserId: APP_USER_ID }],
        claimRows: [{ userId: OTHER_USER_ID, role: 'owner' }],
      })
    ).toEqual({ ok: false, reason: 'forbidden' });
  });
});
