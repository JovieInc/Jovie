import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  archiveMerch: vi.fn(),
  auth: vi.fn(),
  revalidatePath: vi.fn(),
  restoreMerch: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mocks.auth,
}));

vi.mock('@/lib/merch/service', () => ({
  updateMerchCardStatus: mocks.archiveMerch,
  restoreArchivedMerchCard: mocks.restoreMerch,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

describe('Library merch lifecycle actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'user-1' });
    mocks.archiveMerch.mockResolvedValue({ id: 'card-1' });
    mocks.restoreMerch.mockResolvedValue({ id: 'card-1' });
  });

  it('archives through the owned merch persistence contract', async () => {
    const { archiveLibraryMerchCard } = await import(
      '@/app/app/(shell)/library/actions'
    );

    await expect(
      archiveLibraryMerchCard({
        merchCardId: 'card-1',
        profileId: 'profile-1',
      })
    ).resolves.toEqual({ success: true });
    expect(mocks.archiveMerch).toHaveBeenCalledWith({
      cardId: 'card-1',
      profileId: 'profile-1',
      clerkUserId: 'user-1',
      status: 'archived',
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/app/library');
  });

  it('restores archived merch to the safe editable state', async () => {
    const { restoreLibraryMerchCard } = await import(
      '@/app/app/(shell)/library/actions'
    );

    await expect(
      restoreLibraryMerchCard({
        merchCardId: 'card-1',
        profileId: 'profile-1',
      })
    ).resolves.toEqual({ success: true });
    expect(mocks.restoreMerch).toHaveBeenCalledWith({
      cardId: 'card-1',
      profileId: 'profile-1',
      clerkUserId: 'user-1',
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/app/library');
  });

  it('rejects unauthenticated archive and restore calls', async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    const { archiveLibraryMerchCard, restoreLibraryMerchCard } = await import(
      '@/app/app/(shell)/library/actions'
    );

    await expect(
      archiveLibraryMerchCard({
        merchCardId: 'card-1',
        profileId: 'profile-1',
      })
    ).rejects.toThrow('Unauthorized');
    await expect(
      restoreLibraryMerchCard({
        merchCardId: 'card-1',
        profileId: 'profile-1',
      })
    ).rejects.toThrow('Unauthorized');
    expect(mocks.archiveMerch).not.toHaveBeenCalled();
    expect(mocks.restoreMerch).not.toHaveBeenCalled();
  });
});
