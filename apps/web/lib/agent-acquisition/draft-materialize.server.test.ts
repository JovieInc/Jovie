import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  selects: [] as unknown[][],
  upsertRelease: vi.fn(),
  upsertLink: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock('@/lib/db', () => {
  const chain = (): Record<string, unknown> => {
    const self: Record<string, unknown> = {};
    for (const method of ['from', 'where', 'limit']) self[method] = () => self;
    self.then = (resolve: (value: unknown) => void) =>
      resolve(mocks.selects.shift() ?? []);
    return self;
  };
  return { db: { select: () => chain() } };
});
vi.mock('@/lib/cache/releases', () => ({
  invalidateReleaseCaches: mocks.invalidate,
}));
vi.mock('@/lib/discography/queries', () => ({
  upsertRelease: mocks.upsertRelease,
  upsertProviderLink: mocks.upsertLink,
}));

import {
  materializeAgentDraftRelease,
  trustedImageUrl,
} from './draft-materialize.server';
import type { AgentDraftRow } from './draft-store';

function draftRow(
  release: Record<string, unknown> | null,
  links: Record<string, string> = {}
): AgentDraftRow {
  return {
    id: '9efebd98-39b7-4a77-8965-04b5aafad9ad',
    preview: {
      display_name: 'Signal Artist',
      ...(release
        ? { launch: { result: { release, smart_link: { links } } } }
        : {}),
    },
  } as unknown as AgentDraftRow;
}
const release = {
  content_type: 'album',
  title: 'Signal Fire',
  release_date: '2026-11-07',
  upc: '00123456789012',
  artwork_url: 'https://i.scdn.co/image/cover',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.selects = [];
  mocks.upsertRelease.mockResolvedValue({ id: 'release-1' });
});

describe('materializeAgentDraftRelease', () => {
  it('creates the release as an unpublished draft with known-provider links only', async () => {
    mocks.selects = [[], [{ id: 'spotify' }]];
    await materializeAgentDraftRelease(
      draftRow(release, {
        spotify: 'https://open.spotify.com/album/x',
        not_a_provider: 'https://example.com/x',
      }),
      'profile-1',
      'user-1'
    );
    expect(mocks.upsertRelease).toHaveBeenCalledWith({
      creatorProfileId: 'profile-1',
      title: 'Signal Fire',
      slug: 'signal-fire',
      releaseType: 'album',
      releaseDate: new Date('2026-11-07'),
      upc: '00123456789012',
      artworkUrl: 'https://i.scdn.co/image/cover',
      sourceType: 'manual',
      status: 'draft',
      metadata: { agentDraftId: '9efebd98-39b7-4a77-8965-04b5aafad9ad' },
    });
    expect(mocks.upsertLink).toHaveBeenCalledOnce();
    expect(mocks.upsertLink).toHaveBeenCalledWith({
      releaseId: 'release-1',
      providerId: 'spotify',
      url: 'https://open.spotify.com/album/x',
      sourceType: 'manual',
    });
    expect(mocks.invalidate).toHaveBeenCalledWith('user-1', 'profile-1');
  });

  it('drops artwork outside the DSP allowlist and treats tracks as singles', async () => {
    mocks.selects = [[]];
    await materializeAgentDraftRelease(
      draftRow({
        ...release,
        content_type: 'track',
        release_date: null,
        artwork_url: 'https://abc.supabase.co/storage/v1/x.png',
      }),
      'profile-1',
      'user-1'
    );
    expect(mocks.upsertRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        releaseType: 'single',
        releaseDate: null,
        artworkUrl: null,
      })
    );
    expect(mocks.upsertLink).not.toHaveBeenCalled();
  });

  it('never overwrites an existing release with the same slug', async () => {
    mocks.selects = [[{ id: 'release-existing' }]];
    await materializeAgentDraftRelease(draftRow(release), 'profile-1', 'u');
    expect(mocks.upsertRelease).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it('does nothing without a prepared launch title or a usable slug', async () => {
    await materializeAgentDraftRelease(draftRow(null), 'profile-1', 'u');
    await materializeAgentDraftRelease(
      draftRow({ ...release, title: null }),
      'profile-1',
      'u'
    );
    await materializeAgentDraftRelease(
      draftRow({ ...release, title: '!!!' }),
      'profile-1',
      'u'
    );
    expect(mocks.upsertRelease).not.toHaveBeenCalled();
  });
});

describe('agent draft artwork allowlist', () => {
  it('keeps HTTPS artwork from DSP image CDNs', () => {
    for (const url of [
      'https://i.scdn.co/image/ab67616d0000b273',
      'https://image-cdn-ak.spotifycdn.com/image/x',
      'https://is1-ssl.mzstatic.com/image/thumb/x.jpg',
      'https://e-cdns-images.dzcdn.net/images/cover/x.jpg',
      'https://i1.sndcdn.com/artworks-x.jpg',
      'https://resources.tidal.com/images/x.jpg',
      'https://i.ytimg.com/vi/x/hqdefault.jpg',
      'https://f4.bcbits.com/img/a1_10.jpg',
    ]) {
      expect(trustedImageUrl(url)).toBe(url);
    }
  });

  it('drops user-upload hosts that the general CSP list allows', () => {
    for (const url of [
      'https://abc.supabase.co/storage/v1/object/public/x.png',
      'https://x.public.blob.vercel-storage.com/x.png',
      'https://lh3.googleusercontent.com/x',
      'https://cdn.discordapp.com/attachments/x.png',
      'https://api.qrserver.com/v1/create-qr-code/?data=x',
    ]) {
      expect(trustedImageUrl(url)).toBeNull();
    }
  });

  it('drops look-alike hosts, bare wildcard bases and unsafe URLs', () => {
    for (const url of [
      'https://i.scdn.co.evil.example/x.jpg',
      'https://evilmzstatic.com/x.jpg',
      'https://mzstatic.com/x.jpg',
      'http://i.scdn.co/image/x',
      `https://${['viewer', 'x'].join(':')}@i.scdn.co/image/x`,
      'https://i.scdn.co:8443/image/x',
      'javascript:alert(1)',
      'not a url',
      '',
      null,
    ]) {
      expect(trustedImageUrl(url)).toBeNull();
    }
  });
});
