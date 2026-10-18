import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  opaque: vi.fn(),
  image: vi.fn(),
  font: vi.fn(),
  response: vi.fn(),
}));
vi.mock('@/lib/services/profile', () => ({
  getProfileWithLinks: mocks.profile,
}));
vi.mock('@/lib/profile/opaque-internal-profile-handle.server', () => ({
  resolveOpaqueInternalProfileUsername: mocks.opaque,
}));
vi.mock('@/lib/share/profile-image', () => ({
  loadProfileShareImage: mocks.image,
}));
vi.mock('@/lib/share/image-utils', () => ({
  OG_SIZE: { width: 1200, height: 630 },
  loadSatoshiFont: mocks.font,
  toDataUrl: mocks.image,
}));
vi.mock('next/og', () => ({
  ImageResponse: class {
    constructor(node: ReactNode, options: unknown) {
      mocks.response(node, options);
    }
  },
}));

import Image from './opengraph-image';

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

function render(username = 'maya-vale') {
  return Image({ params: Promise.resolve({ username }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.profile.mockResolvedValue({
    isPublic: true,
    displayName: 'Maya Vale',
    username: 'maya-vale',
    usernameNormalized: 'maya-vale',
    avatarUrl: null,
    genres: ['Electronic'],
    isClaimed: false,
    isVerified: false,
  });
  mocks.opaque.mockResolvedValue({ action: 'serve' });
  mocks.image.mockResolvedValue(null);
  mocks.font.mockResolvedValue(new ArrayBuffer(8));
});

describe('profile share image disclosure', () => {
  it.each([
    null,
    {
      isPublic: false,
      displayName: 'Private Person',
      avatarUrl: 'https://private.test/photo',
    },
  ])(
    'returns an uncached neutral 404 for an unavailable profile',
    async profile => {
      mocks.profile.mockResolvedValue(profile);
      await render('private-person');
      const [node, options] = mocks.response.mock.calls[0];
      expect(renderedText(node)).toContain('Profile unavailable');
      expect(renderedText(node)).not.toMatch(
        /private-person|Private Person|artist|growth/i
      );
      expect(options).toMatchObject({
        status: 404,
        headers: { 'Cache-Control': 'no-store' },
      });
      expect(mocks.image).not.toHaveBeenCalled();
    }
  );

  it('returns a neutral, retryable response when storage fails', async () => {
    mocks.profile.mockRejectedValue(new Error('private database failure'));
    await render('private-person');
    const [node, options] = mocks.response.mock.calls[0];
    expect(renderedText(node)).not.toMatch(/private-person|database/);
    expect(options).toMatchObject({
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  });

  it.each(['admin', '../private', 'a'.repeat(100)])(
    'does not resolve invalid or reserved input: %s',
    async username => {
      await render(username);
      expect(mocks.profile).not.toHaveBeenCalled();
    }
  );

  it('does not reveal a blocked opaque handle', async () => {
    mocks.opaque.mockResolvedValue({ action: 'not_found' });
    await render();
    expect(mocks.profile).not.toHaveBeenCalled();
    expect(mocks.response.mock.calls[0][1]).toMatchObject({ status: 404 });
  });

  it('resolves canonical opaque aliases before reading public content', async () => {
    mocks.opaque.mockResolvedValue({ action: 'redirect', handle: 'maya-vale' });
    await render('imported-artist');
    expect(mocks.profile).toHaveBeenCalledWith('maya-vale', {
      skipCache: true,
    });
  });

  it('keeps eligible independent listings public without implying authorization', async () => {
    await render('Maya-Vale');
    const [node, options] = mocks.response.mock.calls[0];
    expect(renderedText(node)).toContain('Maya Vale');
    expect(renderedText(node)).not.toMatch(
      /on Jovie|official|verified|artist.managed/
    );
    expect(mocks.profile).toHaveBeenCalledWith('maya-vale', {
      skipCache: true,
    });
    expect(options).toMatchObject({ headers: { 'Cache-Control': 'no-store' } });
  });

  it('rechecks an existing image URL after publication is revoked', async () => {
    await render();
    mocks.profile.mockResolvedValue({
      isPublic: false,
      displayName: 'Private Person',
    });
    await render();
    const [node, options] = mocks.response.mock.calls[1];
    expect(renderedText(node)).not.toContain('Maya Vale');
    expect(renderedText(node)).not.toContain('Private Person');
    expect(options).toMatchObject({
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  });

  it('uses the exact handle for extreme names rather than clipping words', async () => {
    mocks.profile.mockResolvedValue({
      isPublic: true,
      displayName: 'very long '.repeat(100),
      username: 'maya-vale',
    });
    await render();
    expect(renderedText(mocks.response.mock.calls[0][0])).toContain(
      'maya-vale'
    );
    expect(mocks.image).not.toHaveBeenCalled();
  });

  it('sanitizes the name using the metadata contract', async () => {
    mocks.profile.mockResolvedValue({
      isPublic: true,
      displayName: '<b>Maya Vale</b>',
      username: 'maya-vale',
    });
    await render();
    expect(renderedText(mocks.response.mock.calls[0][0])).toContain(
      'Maya Vale'
    );
    expect(renderedText(mocks.response.mock.calls[0][0])).not.toContain('<b>');
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
