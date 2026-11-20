#!/usr/bin/env tsx
/**
 * Seed live marketing proof content for `jov.ie/you`.
 *
 * Policy: `/you` stays claimable (not reserved, not 410). This script never
 * creates users or steals handles. Tim claims `you` via the product path,
 * then this script fills thesis-matching profile fields + social links.
 *
 *   # dry-run (default): plan only
 *   doppler run -p jovie-web -c prd -- pnpm --filter @jovie/web you-proof:seed \
 *     -- --owner-email=tim@example.com
 *
 *   # apply after Tim owns the handle
 *   doppler run -p jovie-web -c prd -- pnpm --filter @jovie/web you-proof:seed \
 *     -- --owner-email=tim@example.com --apply
 *
 * Needs DATABASE_URL (Doppler jovie-web/prd). Never deletes prod data.
 */
import { parseArgs } from 'node:util';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { isReservedPublicProfileIdentity } from '@/lib/profile/public-profile-identity-policy';
import {
  planYouProofSeed,
  YOU_PROOF_FIXTURE,
  YOU_PROOF_FIXTURE_VERSION,
  YOU_PROOF_HANDLE,
} from '@/lib/synthetic/you-proof-fixture';
import { isReservedUsername } from '@/lib/validation/username-core';

function log(step: string, detail: unknown): void {
  process.stdout.write(
    `[you-proof] ${step} ${JSON.stringify(detail, null, 2)}\n`
  );
}

async function loadHandleRow() {
  const [row] = await db
    .select({
      profileId: creatorProfiles.id,
      username: creatorProfiles.username,
      displayName: creatorProfiles.displayName,
      bio: creatorProfiles.bio,
      isPublic: creatorProfiles.isPublic,
      isClaimed: creatorProfiles.isClaimed,
      userId: creatorProfiles.userId,
      ownerEmail: users.email,
    })
    .from(creatorProfiles)
    .leftJoin(users, eq(users.id, creatorProfiles.userId))
    .where(eq(creatorProfiles.usernameNormalized, YOU_PROOF_HANDLE))
    .limit(1);
  return row ?? null;
}

async function loadOwnerProfile(ownerEmail: string) {
  const [row] = await db
    .select({
      profileId: creatorProfiles.id,
      ownerEmail: users.email,
      username: creatorProfiles.username,
      displayName: creatorProfiles.displayName,
      bio: creatorProfiles.bio,
      isPublic: creatorProfiles.isPublic,
      isClaimed: creatorProfiles.isClaimed,
    })
    .from(users)
    .leftJoin(creatorProfiles, eq(creatorProfiles.userId, users.id))
    .where(eq(users.email, ownerEmail))
    .limit(1);
  if (!row?.profileId) return null;
  return {
    profileId: row.profileId,
    ownerEmail: row.ownerEmail ?? ownerEmail,
    username: row.username,
    displayName: row.displayName,
    bio: row.bio,
    isPublic: row.isPublic,
    isClaimed: row.isClaimed,
  };
}

async function loadSocialPlatforms(profileId: string): Promise<Set<string>> {
  const rows = await db
    .select({ platform: socialLinks.platform })
    .from(socialLinks)
    .where(
      and(
        eq(socialLinks.creatorProfileId, profileId),
        eq(socialLinks.isActive, true),
        eq(socialLinks.state, 'active')
      )
    );
  return new Set(rows.map(row => row.platform));
}

async function main() {
  const { values } = parseArgs({
    options: {
      apply: { type: 'boolean', default: false },
      'owner-email': { type: 'string' },
    },
    allowPositionals: false,
  });

  const apply = values.apply === true;
  const ownerEmail = String(values['owner-email'] ?? '')
    .trim()
    .toLowerCase();

  if (isReservedUsername(YOU_PROOF_HANDLE)) {
    throw new Error(
      'Refusing: "you" is reserved as a system username. Policy forbids this.'
    );
  }
  if (isReservedPublicProfileIdentity(YOU_PROOF_HANDLE)) {
    throw new Error(
      'Refusing: "you" is a reserved public-profile identity. Policy forbids this.'
    );
  }

  const handleRow = await loadHandleRow();
  const ownerProfile = ownerEmail ? await loadOwnerProfile(ownerEmail) : null;
  const existingSocialPlatforms = handleRow
    ? await loadSocialPlatforms(handleRow.profileId)
    : new Set<string>();

  const plan = planYouProofSeed({
    ownerEmail,
    handleRow: handleRow
      ? {
          profileId: handleRow.profileId,
          ownerEmail: handleRow.ownerEmail,
          username: handleRow.username,
          displayName: handleRow.displayName,
          bio: handleRow.bio,
          isPublic: handleRow.isPublic,
          isClaimed: handleRow.isClaimed,
        }
      : null,
    ownerProfile,
    existingSocialPlatforms,
  });

  log('plan', {
    version: YOU_PROOF_FIXTURE_VERSION,
    mode: apply ? 'apply' : 'dry-run',
    ownerEmail: ownerEmail || null,
    handle: YOU_PROOF_HANDLE,
    plan,
    releaseNote:
      'Release "First Light" is not auto-inserted (discography write is Tim/product UI). Artwork path remains /img/releases/first-light.jpg.',
  });

  if (plan.blockers.length > 0) {
    process.stderr.write(
      `[you-proof] blocked:\n${plan.blockers.map(b => `  - ${b}`).join('\n')}\n`
    );
    process.exitCode = 2;
    return;
  }

  if (!apply) {
    process.stdout.write(
      '[you-proof] dry-run only. Re-run with --apply after Tim owns the handle.\n'
    );
    return;
  }

  const profileId = handleRow!.profileId;
  for (const update of plan.profileUpdates) {
    const set = update.set;
    await db
      .update(creatorProfiles)
      .set({
        ...(set.username != null ? { username: String(set.username) } : {}),
        ...(set.username_normalized != null
          ? { usernameNormalized: String(set.username_normalized) }
          : {}),
        ...(set.display_name !== undefined
          ? { displayName: set.display_name as string | null }
          : {}),
        ...(set.bio !== undefined ? { bio: set.bio as string | null } : {}),
        ...(set.is_public !== undefined
          ? { isPublic: Boolean(set.is_public) }
          : {}),
        ...(set.is_claimed !== undefined
          ? { isClaimed: Boolean(set.is_claimed) }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, profileId));
    log('profile-updated', { profileId, set });
  }

  for (const link of plan.socialLinks) {
    if (link.action !== 'insert') continue;
    const fixtureLink = YOU_PROOF_FIXTURE.socialLinks.find(
      item => item.platform === link.platform
    );
    if (!fixtureLink) continue;
    await db.insert(socialLinks).values({
      creatorProfileId: profileId,
      platform: fixtureLink.platform,
      platformType: fixtureLink.platformType,
      url: fixtureLink.url,
      displayText: fixtureLink.displayText,
      sortOrder: fixtureLink.sortOrder,
      isActive: true,
      state: 'active',
      sourceType: 'manual',
    });
    log('social-inserted', { platform: link.platform, url: link.url });
  }

  process.stdout.write(
    '[you-proof] applied. Verify: curl -sI https://jov.ie/you | head -5\n'
  );
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch(error => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
  });
