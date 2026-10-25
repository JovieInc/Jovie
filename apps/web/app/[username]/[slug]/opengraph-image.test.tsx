import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  creator: vi.fn(),
  content: vi.fn(),
  opaque: vi.fn(),
  artwork: vi.fn(),
  font: vi.fn(),
  response: vi.fn(),
}));
vi.mock('@/app/[username]/[slug]/_lib/data', () => ({
  getContentBySlug: mocks.content,
  getCreatorByUsername: mocks.creator,
}));
vi.mock('@/lib/profile/opaque-internal-profile-handle.server', () => ({
  resolveOpaqueInternalProfileUsername: mocks.opaque,
}));
vi.mock('@/lib/share/release-image', () => ({
  loadReleaseShareArtwork: mocks.artwork,
}));
vi.mock('@/lib/share/image-utils', () => ({
  OG_SIZE: { width: 1200, height: 630 },
  loadSatoshiFont: mocks.font,
  toDataUrl: vi.fn(),
}));
vi.mock('next/og', () => ({
  ImageResponse: class {
    constructor(node: ReactNode, options: unknown) {
      mocks.response(node, options);
    }
  },
}));

import Image, { alt, contentType, size } from './opengraph-image';

function renderedText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(renderedText).join(' ');
  if (!node || typeof node !== 'object' || !('props' in node)) return '';
  const element = node as ReactElement<{ children?: ReactNode }>;
  if (typeof element.type === 'function') {
    return renderedText(
      (element.type as (props: unknown) => ReactNode)(element.props)
    );
  }
  return renderedText(element.props.children);
}

function render(username = 'maya-vale', slug = 'neon-tide') {
  return Image({ params: Promise.resolve({ username, slug }) });
}

const CREATOR = {
  id: 'creator-1',
  displayName: 'Maya Vale',
  username: 'maya-vale',
  usernameNormalized: 'maya-vale',
  avatarUrl: null,
} as const;

const PRIMARY_ARTISTS = [
  {
    artistId: 'artist-luna',
    name: 'Luna Reyes',
    handle: 'luna-reyes',
    role: 'main_artist',
    position: 1,
  },
] as const;

function releasedContent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'content-1',
    type: 'release',
    slug: 'neon-tide',
    title: 'Neon Tide',
    artworkUrl: 'https://i.scdn.co/image/medium.jpg',
    artworkSizes: { '1000': 'https://i.scdn.co/image/1000.jpg' },
    releaseDate: new Date('2026-01-15T00:00:00Z'),
    revealDate: new Date('2026-01-01T00:00:00Z'),
    primaryArtists: [...PRIMARY_ARTISTS],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.creator.mockResolvedValue(CREATOR);
  mocks.content.mockResolvedValue(releasedContent());
  mocks.opaque.mockResolvedValue({ action: 'serve' });
  mocks.artwork.mockResolvedValue(null);
  mocks.font.mockResolvedValue(new ArrayBuffer(8));
});

describe('release share image disclosure', () => {
  it('exports the documented card surface', () => {
    expect(alt).toBe('Public release preview');
    expect(contentType).toBe('image/png');
    expect(size).toEqual({ width: 1200, height: 630 });
  });

  it.each(['admin', '../private', 'a'.repeat(100)])(
    'does not resolve invalid input: %s',
    async username => {
      await render(username);
      expect(mocks.creator).not.toHaveBeenCalled();
      expect(mocks.response.mock.calls[0][1]).toMatchObject({ status: 404 });
      expect(renderedText(mocks.response.mock.calls[0][0])).toContain(
        'Release unavailable'
      );
    }
  );

  it('does not resolve an invalid slug', async () => {
    await render('maya-vale', 'Neon_Tide!');
    expect(mocks.creator).not.toHaveBeenCalled();
    const [node, options] = mocks.response.mock.calls[0];
    expect(options).toMatchObject({
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
    expect(renderedText(node)).toContain('Release unavailable');
  });

  it.each([null, { displayName: 'Private Person' }])(
    'returns an uncached neutral 404 when the release is unavailable',
    async creator => {
      mocks.creator.mockResolvedValue(creator);
      await render('maya-vale', 'hidden-tide');
      const [node, options] = mocks.response.mock.calls[0];
      expect(renderedText(node)).toContain('Release unavailable');
      expect(renderedText(node)).not.toMatch(
        /hidden-tide|Neon Tide|Private Person|Luna Reyes|maya-vale/
      );
      expect(options).toMatchObject({
        status: 404,
        headers: { 'Cache-Control': 'no-store' },
      });
      expect(mocks.artwork).not.toHaveBeenCalled();
    }
  );

  it('returns a neutral, retryable response when the lookup fails', async () => {
    mocks.content.mockRejectedValue(new Error('private database failure'));
    await render('maya-vale', 'neon-tide');
    const [node, options] = mocks.response.mock.calls[0];
    expect(renderedText(node)).not.toMatch(/database|Neon Tide/);
    expect(options).toMatchObject({
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  });

  it('resolves canonical opaque aliases before reading public content', async () => {
    mocks.opaque.mockResolvedValue({ action: 'redirect', handle: 'maya-vale' });
    await render('imported-artist');
    expect(mocks.creator).toHaveBeenCalledWith('maya-vale');
    expect(mocks.content).toHaveBeenCalledWith('creator-1', 'neon-tide');
  });

  it('renders the title with the real artist credit, type and year', async () => {
    await render();
    const [node, options] = mocks.response.mock.calls[0];
    const text = renderedText(node);
    // The credit is the canonical primary artist, not the profile owner.
    expect(text).toContain('Luna Reyes');
    expect(text).toContain('Neon Tide');
    expect(text).toContain('album');
    expect(text).toContain('2026');
    expect(text).toContain('jov.ie/maya-vale/neon-tide');
    expect(text).not.toContain('Control how the world sees you');
    expect(options).toMatchObject({
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  });

  it('loads the largest sleeve variant for revealed releases', async () => {
    await render();
    expect(mocks.artwork).toHaveBeenCalledWith(
      'https://i.scdn.co/image/1000.jpg'
    );
  });

  it('keeps mystery titles and sleeves hidden', async () => {
    mocks.content.mockResolvedValue(
      releasedContent({
        releaseDate: new Date('2030-06-01T00:00:00Z'),
        revealDate: new Date('2030-05-01T00:00:00Z'),
      })
    );
    await render();
    const [node, options] = mocks.response.mock.calls[0];
    const text = renderedText(node);
    expect(text).toContain('New music from');
    expect(text).not.toContain('Neon Tide');
    expect(text).toContain('coming soon');
    expect(mocks.artwork).not.toHaveBeenCalled();
    expect(options).toMatchObject({ status: 200 });
  });

  it('falls back to the owner name when a release has no credits', async () => {
    mocks.content.mockResolvedValue(
      releasedContent({
        primaryArtists: [],
      })
    );
    await render();
    expect(renderedText(mocks.response.mock.calls[0][0])).toContain(
      'Maya Vale'
    );
  });

  it('returns a real failure rather than caching a substitute font', async () => {
    mocks.font.mockRejectedValue(new Error('font missing'));
    const response = await render();
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(503);
    expect((response as Response).headers.get('Cache-Control')).toBe(
      'no-store'
    );
  });
});
