import { describe, expect, it, vi } from 'vitest';
import { YOU_PROOF_FIXTURE, YOU_PROOF_HANDLE } from './you-proof-fixture';
import {
  runYouProofSeed,
  type YouProofHandleRow,
  type YouProofSeedStore,
} from './you-proof-seed';

function ownedHandle(
  overrides: Partial<YouProofHandleRow> = {}
): YouProofHandleRow {
  return {
    profileId: 'p-you',
    ownerEmail: 'tim@jov.ie',
    username: YOU_PROOF_HANDLE,
    displayName: null,
    bio: null,
    isPublic: false,
    isClaimed: false,
    ...overrides,
  };
}

function createStore(options?: {
  readonly handleRow?: YouProofHandleRow | null;
  readonly store?: Partial<YouProofSeedStore>;
}): {
  readonly store: YouProofSeedStore;
  readonly updateProfile: ReturnType<typeof vi.fn>;
  readonly insertSocialLink: ReturnType<typeof vi.fn>;
} {
  const handleRow =
    options && 'handleRow' in options ? options.handleRow : ownedHandle();
  const overrides = options?.store ?? {};
  const updateProfile = vi.fn(async () => undefined);
  const insertSocialLink = vi.fn(async () => undefined);
  return {
    updateProfile,
    insertSocialLink,
    store: {
      loadHandleRow: overrides.loadHandleRow ?? (async () => handleRow ?? null),
      loadOwnerProfile:
        overrides.loadOwnerProfile ??
        (async ownerEmail =>
          handleRow
            ? {
                profileId: handleRow.profileId,
                ownerEmail,
                username: handleRow.username,
                displayName: handleRow.displayName,
                bio: handleRow.bio,
                isPublic: handleRow.isPublic,
                isClaimed: handleRow.isClaimed,
              }
            : null),
      loadSocialPlatforms:
        overrides.loadSocialPlatforms ?? (async () => new Set<string>()),
      updateProfile: overrides.updateProfile ?? updateProfile,
      insertSocialLink: overrides.insertSocialLink ?? insertSocialLink,
    },
  };
}

describe('runYouProofSeed', () => {
  it('dry-runs a plan without writing', async () => {
    const { store, updateProfile, insertSocialLink } = createStore();
    const result = await runYouProofSeed({
      ownerEmail: 'tim@jov.ie',
      apply: false,
      store,
    });
    expect(result.exitCode).toBe(0);
    expect(result.mode).toBe('dry-run');
    expect(result.plan.blockers).toEqual([]);
    expect(result.plan.profileUpdates.length).toBeGreaterThan(0);
    expect(updateProfile).not.toHaveBeenCalled();
    expect(insertSocialLink).not.toHaveBeenCalled();
    expect(result.messages.join('\n')).toMatch(/status=dry-run/);
  });

  it('exits 2 when the handle is free', async () => {
    const { store, updateProfile } = createStore({ handleRow: null });
    const result = await runYouProofSeed({
      ownerEmail: 'tim@jov.ie',
      apply: true,
      store,
    });
    expect(result.exitCode).toBe(2);
    expect(result.applied).toEqual({ profileUpdates: 0, socialInserts: 0 });
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('exits 2 when another owner holds the handle', async () => {
    const { store } = createStore({
      handleRow: ownedHandle({ ownerEmail: 'other@example.com' }),
      store: { loadOwnerProfile: async () => null },
    });
    const result = await runYouProofSeed({
      ownerEmail: 'tim@jov.ie',
      apply: true,
      store,
    });
    expect(result.exitCode).toBe(2);
    expect(result.plan.blockers[0]).toMatch(/owned by other@example.com/i);
  });

  it('applies profile + social inserts for an owned empty page', async () => {
    const { store, updateProfile, insertSocialLink } = createStore();
    const result = await runYouProofSeed({
      ownerEmail: 'tim@jov.ie',
      apply: true,
      store,
    });
    expect(result.exitCode).toBe(0);
    expect(result.mode).toBe('apply');
    expect(result.applied.profileUpdates).toBe(1);
    expect(result.applied.socialInserts).toBe(
      YOU_PROOF_FIXTURE.socialLinks.length
    );
    expect(updateProfile).toHaveBeenCalledWith(
      'p-you',
      expect.objectContaining({
        display_name: YOU_PROOF_FIXTURE.displayName,
        bio: YOU_PROOF_FIXTURE.bio,
        is_public: true,
      })
    );
    expect(insertSocialLink).toHaveBeenCalledTimes(
      YOU_PROOF_FIXTURE.socialLinks.length
    );
    expect(result.messages.join('\n')).toMatch(/status=applied/);
  });

  it('is idempotent when already converged', async () => {
    const { store, updateProfile, insertSocialLink } = createStore({
      handleRow: ownedHandle({
        displayName: YOU_PROOF_FIXTURE.displayName,
        bio: YOU_PROOF_FIXTURE.bio,
        isPublic: true,
        isClaimed: true,
      }),
      store: {
        loadSocialPlatforms: async () =>
          new Set(YOU_PROOF_FIXTURE.socialLinks.map(link => link.platform)),
      },
    });
    const result = await runYouProofSeed({
      ownerEmail: 'tim@jov.ie',
      apply: true,
      store,
    });
    expect(result.exitCode).toBe(0);
    expect(result.applied).toEqual({ profileUpdates: 0, socialInserts: 0 });
    expect(updateProfile).not.toHaveBeenCalled();
    expect(insertSocialLink).not.toHaveBeenCalled();
    expect(
      result.plan.socialLinks.every(link => link.action === 'unchanged')
    ).toBe(true);
  });

  it('requires an owner email', async () => {
    const { store } = createStore();
    const result = await runYouProofSeed({
      ownerEmail: '   ',
      apply: false,
      store,
    });
    expect(result.exitCode).toBe(2);
    expect(result.plan.blockers[0]).toMatch(/owner-email/i);
  });
});
