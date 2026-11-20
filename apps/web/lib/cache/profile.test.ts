import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidatePath = vi.fn();
const revalidateTag = vi.fn();

vi.mock('next/cache', () => ({
  revalidatePath,
  revalidateTag,
}));

vi.mock('@/lib/onboarding/handle-availability-cache', () => ({
  invalidateHandleCache: vi.fn(),
}));

const invalidateProfileEdgeCache = vi.fn();
vi.mock('@/lib/services/profile/queries', () => ({
  invalidateProfileEdgeCache,
}));

describe('invalidateProfileCache discovery outputs (JOV-6260)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invalidates directory, sitemap, and proof-module caches on unpublication', async () => {
    const { invalidateProfileCache } = await import('./profile');
    await invalidateProfileCache('newrelease');

    expect(revalidateTag).toHaveBeenCalledWith('sitemap-catalog', 'max');
    expect(revalidateTag).toHaveBeenCalledWith('featured-creators', 'max');
    expect(revalidateTag).toHaveBeenCalledWith('artists-directory', 'max');
    expect(revalidateTag).toHaveBeenCalledWith('profile:newrelease', 'max');
    expect(revalidatePath).toHaveBeenCalledWith('/artists');
    expect(revalidatePath).toHaveBeenCalledWith('/newrelease');
  });
  it("expires only the edited artist's profile entry, not every artist's", async () => {
    const { invalidateProfileCache } = await import('./profile');
    await invalidateProfileCache('newrelease');

    expect(revalidateTag).not.toHaveBeenCalledWith(
      'profiles-all',
      expect.anything()
    );
    expect(revalidateTag).toHaveBeenCalledWith('profile:newrelease', 'max');
  });
  it('falls back to the profiles-all family when the handle is unknown', async () => {
    const { invalidateProfileCache } = await import('./profile');
    await invalidateProfileCache(null);

    expect(revalidateTag).toHaveBeenCalledWith('profiles-all', 'max');
  });
  it('hard-expires old discovery and profile payloads after an owner privacy change', async () => {
    const { invalidateProfileCache } = await import('./profile');
    await invalidateProfileCache('newrelease', undefined, {
      privacyChanged: true,
    });
    for (const tag of [
      'sitemap-catalog',
      'featured-creators',
      'artists-directory',
      'profiles-all',
      'profile:newrelease',
    ]) {
      expect(revalidateTag).toHaveBeenCalledWith(tag, { expire: 0 });
    }
    expect(revalidatePath).toHaveBeenCalledWith('/newrelease', 'layout');
    expect(revalidatePath).toHaveBeenCalledWith('/sitemap.xml');
    expect(revalidatePath).toHaveBeenCalledWith('/api/featured-creators');
    expect(revalidateTag).not.toHaveBeenCalledWith(expect.anything(), 'max');
  });
  it('hard-expires the old handle and descendants when privacy changes during a rename', async () => {
    const { invalidateProfileCache } = await import('./profile');
    await invalidateProfileCache('newartist', 'oldartist', {
      privacyChanged: true,
    });
    expect(revalidateTag).toHaveBeenCalledWith('profile:oldartist', {
      expire: 0,
    });
    expect(revalidatePath).toHaveBeenCalledWith('/oldartist', 'layout');
  });
});

describe('Redis profile cache on link and avatar changes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears the Redis profile entry when social links change', async () => {
    const { invalidateSocialLinksCache } = await import('./profile');
    await invalidateSocialLinksCache('profile-1', 'newrelease');
    expect(invalidateProfileEdgeCache).toHaveBeenCalledWith('newrelease');
  });

  it('clears the Redis profile entry when the avatar changes', async () => {
    const { invalidateAvatarCache } = await import('./profile');
    await invalidateAvatarCache('user-1', 'newrelease');
    expect(invalidateProfileEdgeCache).toHaveBeenCalledWith('newrelease');
  });

  it('skips Redis when the handle is unknown', async () => {
    const { invalidateSocialLinksCache, invalidateAvatarCache } = await import(
      './profile'
    );
    await invalidateSocialLinksCache('profile-1', null);
    await invalidateAvatarCache('user-1');
    expect(invalidateProfileEdgeCache).not.toHaveBeenCalled();
  });
});
