/**
 * Activate a QA auth account created via the real signup flow so the
 * dashboard/settings gate passes (waitlist_pending → active + claimed
 * profile). Dev/staging QA tooling — refuses production DATABASE_URL unless
 * --allow-prod is passed explicitly.
 *
 * Usage:
 *   doppler run --project jovie-web --config dev -- \
 *     pnpm tsx apps/web/scripts/qa-activate-auth-user.ts --email qa+e2e+x@timwhite.co
 */
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  ensureCreatorProfileRecord,
  ensureUserProfileClaim,
  setActiveProfileForUser,
} from '@/lib/testing/test-user-provision.server';

function arg(name: string): string | null {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

async function main() {
  const email = arg('email');
  if (!email) {
    console.error('usage: --email <qa email>');
    process.exit(2);
  }
  if (
    process.env.VERCEL_ENV === 'production' &&
    !process.argv.includes('--allow-prod')
  ) {
    console.error('refusing to run against production without --allow-prod');
    process.exit(2);
  }

  const [user] = await db
    .select({ id: users.id, status: users.userStatus })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user) {
    console.error(`no users row for ${email}`);
    process.exit(1);
  }

  const username = `qa-${user.id.slice(0, 8)}`;
  const profileId = await ensureCreatorProfileRecord(db, {
    userId: user.id,
    creatorType: 'artist',
    username,
    usernameNormalized: username.toLowerCase(),
    displayName: 'QA Auth Proof',
    bio: 'QA evidence account',
    venmoHandle: null,
    avatarUrl: null,
    spotifyUrl: null,
    appleMusicUrl: null,
    appleMusicId: null,
    youtubeMusicId: null,
    deezerId: null,
    tidalId: null,
    soundcloudId: null,
    // isProfileComplete() requires isPublic !== false — false would bounce
    // the account back to onboarding (/start).
    isPublic: true,
    isVerified: false,
    isClaimed: true,
    ingestionStatus: 'idle',
    onboardingCompletedAt: new Date(),
  });
  await ensureUserProfileClaim(db, user.id, profileId);
  await setActiveProfileForUser(db, user.id, profileId);
  // ensure* no-ops on existing rows; force the completeness fields.
  await db
    .update(creatorProfiles)
    .set({
      isPublic: true,
      onboardingCompletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(creatorProfiles.id, profileId));
  await db
    .update(users)
    .set({ userStatus: 'active', updatedAt: new Date() })
    .where(eq(users.id, user.id));

  console.log(
    JSON.stringify({ ok: true, email, userId: user.id, profileId, username })
  );
  process.exit(0);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
