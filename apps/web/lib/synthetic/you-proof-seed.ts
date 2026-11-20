/**
 * Runnable seed for live `jov.ie/you` marketing proof.
 *
 * CLI: `scripts/seed-you-proof.ts`. Prod apply needs Tim + Doppler; this
 * module stays injectable so unit tests cover the write paths without DB.
 */

import { isReservedPublicProfileIdentity } from '@/lib/profile/public-profile-identity-policy';
import { isReservedUsername } from '@/lib/validation/username-core';
import {
  planYouProofSeed,
  YOU_PROOF_FIXTURE,
  YOU_PROOF_FIXTURE_VERSION,
  YOU_PROOF_HANDLE,
  type YouProofPlan,
  type YouProofProfileSnapshot,
  type YouProofSeedValue,
} from './you-proof-fixture';

export type { YouProofSeedValue };

export interface YouProofHandleRow {
  readonly profileId: string;
  readonly ownerEmail: string | null;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly bio: string | null;
  readonly isPublic: boolean | null;
  readonly isClaimed: boolean | null;
}

export interface YouProofSeedStore {
  readonly loadHandleRow: () => Promise<YouProofHandleRow | null>;
  readonly loadOwnerProfile: (
    ownerEmail: string
  ) => Promise<YouProofProfileSnapshot | null>;
  readonly loadSocialPlatforms: (profileId: string) => Promise<Set<string>>;
  readonly updateProfile: (
    profileId: string,
    set: Readonly<Record<string, YouProofSeedValue>>
  ) => Promise<void>;
  readonly insertSocialLink: (input: {
    readonly profileId: string;
    readonly platform: string;
    readonly platformType: string;
    readonly url: string;
    readonly displayText: string;
    readonly sortOrder: number;
  }) => Promise<void>;
}

export interface YouProofSeedResult {
  readonly mode: 'dry-run' | 'apply';
  readonly plan: YouProofPlan;
  readonly exitCode: 0 | 1 | 2;
  readonly messages: readonly string[];
  readonly applied: {
    readonly profileUpdates: number;
    readonly socialInserts: number;
  };
}

function assertHandlePolicy(): void {
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
}

export async function runYouProofSeed(input: {
  readonly ownerEmail: string;
  readonly apply: boolean;
  readonly store: YouProofSeedStore;
  readonly log?: (step: string, detail: unknown) => void;
}): Promise<YouProofSeedResult> {
  assertHandlePolicy();

  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  const log = input.log ?? (() => undefined);
  const messages: string[] = [];

  const handleRow = await input.store.loadHandleRow();
  const ownerProfile = ownerEmail
    ? await input.store.loadOwnerProfile(ownerEmail)
    : null;
  const existingSocialPlatforms = handleRow
    ? await input.store.loadSocialPlatforms(handleRow.profileId)
    : new Set<string>();

  const plan = planYouProofSeed({
    ownerEmail,
    handleRow,
    ownerProfile,
    existingSocialPlatforms,
  });

  log('plan', {
    version: YOU_PROOF_FIXTURE_VERSION,
    mode: input.apply ? 'apply' : 'dry-run',
    ownerEmail: ownerEmail || null,
    handle: YOU_PROOF_HANDLE,
    plan,
    releaseNote: 'first-light-release-manual',
  });

  if (plan.blockers.length > 0) {
    messages.push(`status=blocked;${plan.blockers.join(';')}`);
    return {
      mode: input.apply ? 'apply' : 'dry-run',
      plan,
      exitCode: 2,
      messages,
      applied: { profileUpdates: 0, socialInserts: 0 },
    };
  }

  if (!input.apply) {
    messages.push('status=dry-run');
    return {
      mode: 'dry-run',
      plan,
      exitCode: 0,
      messages,
      applied: { profileUpdates: 0, socialInserts: 0 },
    };
  }

  if (!handleRow) {
    messages.push('status=blocked;handle-row-missing');
    return {
      mode: 'apply',
      plan,
      exitCode: 2,
      messages,
      applied: { profileUpdates: 0, socialInserts: 0 },
    };
  }

  const profileId = handleRow.profileId;
  let profileUpdates = 0;
  for (const update of plan.profileUpdates) {
    await input.store.updateProfile(profileId, update.set);
    profileUpdates += 1;
    log('profile-updated', { profileId, set: update.set });
  }

  let socialInserts = 0;
  for (const link of plan.socialLinks) {
    if (link.action !== 'insert') continue;
    const fixtureLink = YOU_PROOF_FIXTURE.socialLinks.find(
      item => item.platform === link.platform
    );
    if (!fixtureLink) continue;
    await input.store.insertSocialLink({
      profileId,
      platform: fixtureLink.platform,
      platformType: fixtureLink.platformType,
      url: fixtureLink.url,
      displayText: fixtureLink.displayText,
      sortOrder: fixtureLink.sortOrder,
    });
    socialInserts += 1;
    log('social-inserted', { platform: link.platform, url: link.url });
  }

  messages.push('status=applied');
  return {
    mode: 'apply',
    plan,
    exitCode: 0,
    messages,
    applied: { profileUpdates, socialInserts },
  };
}
