import { describe, expect, it } from 'vitest';
import { isReservedPublicProfileIdentity } from '@/lib/profile/public-profile-identity-policy';
import { getPublicUrlPolicyEntry } from '@/lib/seo/public-url-policy';
import { isReservedUsername } from '@/lib/validation/username-core';
import {
  planYouProofSeed,
  YOU_PROOF_FIXTURE,
  YOU_PROOF_HANDLE,
} from './you-proof-fixture';

describe('you-proof fixture', () => {
  it('keeps /you claimable and never reserved', () => {
    expect(YOU_PROOF_HANDLE).toBe('you');
    expect(isReservedUsername(YOU_PROOF_HANDLE)).toBe(false);
    expect(isReservedPublicProfileIdentity(YOU_PROOF_HANDLE)).toBe(false);
    expect(getPublicUrlPolicyEntry('/you')).toMatchObject({
      action: 'hold',
      owner: 'summer',
    });
  });

  // Locked to HOMEPAGE_TEMPLATE_PROFILE_* in
  // components/features/home/homepage-profile-preview-fixture.ts (node tests
  // cannot import @/components).
  it('mirrors the homepage hero template identity and release', () => {
    expect(YOU_PROOF_FIXTURE.handle).toBe('you');
    expect(YOU_PROOF_FIXTURE.displayName).toBe('Your Name');
    expect(YOU_PROOF_FIXTURE.release.slug).toBe('first-light');
    expect(YOU_PROOF_FIXTURE.release.artworkPath).toBe(
      '/img/releases/first-light.jpg'
    );
  });

  it('blocks apply when the handle is still free', () => {
    const plan = planYouProofSeed({
      ownerEmail: 'tim@jov.ie',
      handleRow: null,
      ownerProfile: null,
      existingSocialPlatforms: new Set(),
    });
    expect(plan.blockers[0]).toMatch(/Claim it first/i);
    expect(plan.profileUpdates).toEqual([]);
  });

  it('blocks when another owner holds the handle', () => {
    const plan = planYouProofSeed({
      ownerEmail: 'tim@jov.ie',
      handleRow: {
        profileId: 'p-other',
        ownerEmail: 'someone@example.com',
        username: 'you',
        displayName: 'Taken',
        bio: null,
        isPublic: true,
        isClaimed: true,
      },
      ownerProfile: null,
      existingSocialPlatforms: new Set(),
    });
    expect(plan.blockers[0]).toMatch(/owned by someone@example.com/i);
  });

  it('blocks when the owner already has a different profile', () => {
    const plan = planYouProofSeed({
      ownerEmail: 'tim@jov.ie',
      handleRow: {
        profileId: 'p-you',
        ownerEmail: 'tim@jov.ie',
        username: 'you',
        displayName: null,
        bio: null,
        isPublic: true,
        isClaimed: true,
      },
      ownerProfile: {
        profileId: 'p-other',
        ownerEmail: 'tim@jov.ie',
        username: 'tim',
        displayName: 'Tim',
        bio: null,
        isPublic: true,
        isClaimed: true,
      },
      existingSocialPlatforms: new Set(),
    });
    expect(plan.blockers[0]).toMatch(/different profile/i);
  });

  it('plans profile + social inserts for an owned empty proof page', () => {
    const plan = planYouProofSeed({
      ownerEmail: 'tim@jov.ie',
      handleRow: {
        profileId: 'p-you',
        ownerEmail: 'tim@jov.ie',
        username: 'you',
        displayName: null,
        bio: null,
        isPublic: false,
        isClaimed: false,
      },
      ownerProfile: {
        profileId: 'p-you',
        ownerEmail: 'tim@jov.ie',
        username: 'you',
        displayName: null,
        bio: null,
        isPublic: false,
        isClaimed: false,
      },
      existingSocialPlatforms: new Set(),
    });
    expect(plan.blockers).toEqual([]);
    expect(plan.profileUpdates).toHaveLength(1);
    expect(plan.profileUpdates[0]?.set).toMatchObject({
      display_name: YOU_PROOF_FIXTURE.displayName,
      bio: YOU_PROOF_FIXTURE.bio,
      is_public: true,
    });
    expect(plan.profileUpdates[0]?.set).not.toHaveProperty('is_claimed');
    expect(plan.socialLinks.every(link => link.action === 'insert')).toBe(true);
  });

  it('is idempotent when already converged', () => {
    const plan = planYouProofSeed({
      ownerEmail: 'tim@jov.ie',
      handleRow: {
        profileId: 'p-you',
        ownerEmail: 'tim@jov.ie',
        username: YOU_PROOF_FIXTURE.handle,
        displayName: YOU_PROOF_FIXTURE.displayName,
        bio: YOU_PROOF_FIXTURE.bio,
        isPublic: true,
        isClaimed: true,
      },
      ownerProfile: {
        profileId: 'p-you',
        ownerEmail: 'tim@jov.ie',
        username: YOU_PROOF_FIXTURE.handle,
        displayName: YOU_PROOF_FIXTURE.displayName,
        bio: YOU_PROOF_FIXTURE.bio,
        isPublic: true,
        isClaimed: true,
      },
      existingSocialPlatforms: new Set(
        YOU_PROOF_FIXTURE.socialLinks.map(link => link.platform)
      ),
    });
    expect(plan.blockers).toEqual([]);
    expect(plan.profileUpdates).toEqual([]);
    expect(plan.socialLinks.every(link => link.action === 'unchanged')).toBe(
      true
    );
  });
});
