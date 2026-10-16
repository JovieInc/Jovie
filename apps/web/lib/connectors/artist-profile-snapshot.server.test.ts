import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileAccessDecision } from '@/lib/auth/profile-access';
import type { SocialLink } from '@/lib/db/queries/shared';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  links: vi.fn(),
  profile: vi.fn(),
  session: vi.fn(),
}));
vi.mock('@/lib/auth/profile-access', () => ({
  getExactProfileAccess: mocks.access,
}));
vi.mock('@/lib/db/queries/shared', () => ({
  getProfileSocialLinks: mocks.links,
}));
vi.mock('@/lib/auth/session', () => ({ withDbSessionTx: mocks.session }));

import { getArtistProfileSnapshot } from './artist-profile-snapshot.server';

const profileId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const profile = {
  avatar_url: 'https://images.example.com/canonical.jpg',
  bio: 'Canonical bio',
  username: 'Artist',
  username_normalized: 'artist',
  profileEditVersion: 4,
};
const website: SocialLink = {
  id: '33333333-3333-4333-8333-333333333333',
  platform: 'website',
  platformType: 'custom',
  url: 'https://artist.example.com',
  sortOrder: 1,
  isActive: true,
  state: 'active',
  confidence: '1.00',
  displayText: null,
  sourcePlatform: null,
  sourceType: 'manual',
  version: 2,
};
const tx = {
  select: () => ({ from: () => ({ where: () => ({ limit: mocks.profile }) }) }),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockImplementation(operation => operation(tx, userId));
  mocks.access.mockResolvedValue({ ok: true, profileId, ownerUserId: userId });
  mocks.profile.mockResolvedValue([{ ...profile }]);
  mocks.links.mockResolvedValue([{ ...website }]);
});

describe('canonical artist-profile snapshots', () => {
  it('returns canonical values and versioned provenance in one authenticated read', async () => {
    const snapshot = await getArtistProfileSnapshot(profileId);
    expect(snapshot.fields.bio).toMatchObject({
      status: 'available',
      value: profile.bio,
    });
    expect(snapshot.fields.image).toMatchObject({ value: profile.avatar_url });
    expect(snapshot.fields.bio_link).toMatchObject({
      value: 'https://jov.ie/artist',
      provenance: {
        source: 'creator_profiles',
        profileId,
        profileEditVersion: 4,
        resolver: 'buildProfileCanonicalUrl',
      },
    });
    expect(snapshot.fields.website).toEqual({
      status: 'available',
      value: website.url,
      provenance: {
        source: 'social_links',
        profileId,
        links: [{ id: website.id, version: 2 }],
      },
    });
    expect(mocks.access).toHaveBeenCalledWith(tx, userId, profileId);
    expect(mocks.links).toHaveBeenCalledWith(tx, profileId, { limit: null });
    expect(mocks.session).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'repeatable read',
    });
  });

  it.each([null, '', '  '])(
    'leaves empty image and bio unavailable (%s)',
    async value => {
      mocks.profile.mockResolvedValue([
        {
          ...profile,
          avatar_url: value,
          bio: value,
          username_normalized: '',
          username: '',
        },
      ]);
      mocks.links.mockResolvedValue([]);
      const snapshot = await getArtistProfileSnapshot(profileId);
      for (const field of Object.values(snapshot.fields)) {
        expect(field).toMatchObject({
          status: 'unavailable',
          value: null,
          reason: 'missing',
        });
        expect(field.provenance.profileId).toBe(profileId);
      }
    }
  );

  it('keeps blank websites missing and multiple websites ambiguous even with equal URLs', async () => {
    mocks.links.mockResolvedValue([{ ...website, url: '  ' }]);
    expect(
      (await getArtistProfileSnapshot(profileId)).fields.website
    ).toMatchObject({ reason: 'missing', value: null });
    mocks.links.mockResolvedValue([
      website,
      { ...website, id: 'another', sortOrder: 0 },
    ]);
    expect(
      (await getArtistProfileSnapshot(profileId)).fields.website
    ).toMatchObject({ reason: 'ambiguous', value: null });
  });

  it('includes website-type links and excludes inactive, rejected, and unrelated links', async () => {
    mocks.links.mockResolvedValue([
      { ...website, platform: 'custom', platformType: 'website' },
      { ...website, id: 'inactive', isActive: false },
      { ...website, id: 'rejected', state: 'rejected' },
      { ...website, id: 'unknown-state', state: null },
      {
        ...website,
        id: 'unknown-active',
        isActive: null,
        platformType: null,
        sortOrder: null,
      },
      { ...website, id: 'social', platform: 'instagram' },
    ]);
    const snapshot = await getArtistProfileSnapshot(profileId);
    expect(snapshot.fields.website.value).toBe(website.url);
    expect(snapshot.fields.website.provenance).toMatchObject({
      links: [{ id: website.id, version: 2 }],
    });
  });

  it('is deterministic across row order and ignores unrelated link versions', async () => {
    const second = { ...website, id: '44444444-4444-4444-8444-444444444444' };
    mocks.links.mockResolvedValue([website, second]);
    const first = await getArtistProfileSnapshot(profileId);
    mocks.links.mockResolvedValue([
      second,
      website,
      { ...website, id: 'social', platform: 'instagram', version: 900 },
    ]);
    expect(await getArtistProfileSnapshot(profileId)).toEqual(first);
  });

  it('invalidates revisions on profile edits and website row/version changes', async () => {
    const first = await getArtistProfileSnapshot(profileId);
    for (const links of [
      [],
      [{ ...website, version: 3 }],
      [{ ...website, id: 'replacement' }],
      [{ ...website, state: 'rejected' }],
    ]) {
      mocks.links.mockResolvedValue(links);
      expect((await getArtistProfileSnapshot(profileId)).revision).not.toBe(
        first.revision
      );
    }
    mocks.links.mockResolvedValue([website]);
    mocks.profile.mockResolvedValue([{ ...profile, profileEditVersion: 5 }]);
    expect((await getArtistProfileSnapshot(profileId)).revision).not.toBe(
      first.revision
    );
  });

  it('accepts the current revision and rejects a stale social-link version', async () => {
    const { revision } = await getArtistProfileSnapshot(profileId);
    await expect(
      getArtistProfileSnapshot(profileId, { expectedRevision: revision })
    ).resolves.toMatchObject({ revision });
    mocks.links.mockResolvedValue([{ ...website, version: 3 }]);
    await expect(
      getArtistProfileSnapshot(profileId, { expectedRevision: revision })
    ).rejects.toMatchObject({ reason: 'stale_revision' });
  });

  it.each(['invalid', 'not_found', 'forbidden', 'ambiguous'] as const)(
    'returns no values when exact access is %s',
    async reason => {
      mocks.access.mockResolvedValue({
        ok: false,
        reason,
      } satisfies ProfileAccessDecision);
      await expect(getArtistProfileSnapshot(profileId)).rejects.toMatchObject({
        reason,
      });
      expect(mocks.profile).not.toHaveBeenCalled();
      expect(mocks.links).not.toHaveBeenCalled();
    }
  );

  it('fails closed when the authorized profile cannot be loaded', async () => {
    mocks.profile.mockResolvedValue([]);
    await expect(getArtistProfileSnapshot(profileId)).rejects.toMatchObject({
      reason: 'not_found',
    });
    expect(mocks.links).not.toHaveBeenCalled();
  });

  it('propagates session/database failures and never projects supplied destination values', async () => {
    const destinationPayload = {
      bio: 'Destination bio',
      image: 'https://destination.example.com/image',
      website: 'https://destination.example.com',
      bio_link: 'https://destination.example.com/bio',
    };
    const options = { destinationPayload };
    const canonical = await getArtistProfileSnapshot(profileId);
    // Runtime extra properties cannot become canonical sources.
    expect(
      await getArtistProfileSnapshot(profileId, {
        ...options,
        expectedRevision: undefined,
      })
    ).toEqual(canonical);
    expect(Object.keys(canonical.fields)).toEqual([
      'bio',
      'bio_link',
      'image',
      'website',
    ]);
    mocks.session.mockRejectedValue(new Error('Unauthorized'));
    await expect(getArtistProfileSnapshot(profileId)).rejects.toThrow(
      'Unauthorized'
    );
  });
});
