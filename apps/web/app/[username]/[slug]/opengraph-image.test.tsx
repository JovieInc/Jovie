import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  creator: vi.fn(),
  content: vi.fn(),
  opaque: vi.fn(),
  image: vi.fn(),
  font: vi.fn(),
  response: vi.fn(),
}));
vi.mock('./_lib/data', () => ({
  getCreatorByUsername: mocks.creator,
  getContentBySlug: mocks.content,
}));
vi.mock('@/lib/profile/opaque-internal-profile-handle.server', () => ({
  resolveOpaqueInternalProfileUsername: mocks.opaque,
}));
vi.mock('@/lib/share/image-utils', () => ({
  OG_SIZE: { width: 1200, height: 630 },
  loadSatoshiFont: mocks.font,
  toDataUrl: mocks.image,
}));
vi.mock('next/server', () => ({
  connection: () => Promise.resolve(undefined),
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

function render(username = 'maya-vale', slug = 'midnight-signal') {
  return Image({ params: Promise.resolve({ username, slug }) });
}

const RELEASE_CONTENT = {
  type: 'release',
  slug: 'midnight-signal',
  title: 'Midnight Signal',
  releaseDate: new Date('2026-01-01'),
  revealDate: null,
  artworkUrl: 'https://i.scdn.co/image/cover',
  primaryArtists: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.creator.mockResolvedValue({
    id: 'profile-1',
    username: 'maya-vale',
    usernameNormalized: 'maya-vale',
    displayName: 'Maya Vale',
  });
  mocks.content.mockResolvedValue(RELEASE_CONTENT);
  mocks.opaque.mockResolvedValue({ action: 'serve' });
  mocks.image.mockResolvedValue(null); // toDataUrl returns string | null
  mocks.font.mockResolvedValue(new ArrayBuffer(8));
});

describe('release share image disclosure', () => {
  it('renders an uncached neutral 404 card when the content is not found', async () => {
    mocks.content.mockResolvedValue(null);
    await render();
    const [node, options] = mocks.response.mock.calls[0];
    expect(renderedText(node)).toContain('Release not found');
    expect(renderedText(node)).not.toMatch(/maya-vale|Midnight Signal/i);
    expect(options).toMatchObject({
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
    expect(mocks.image).not.toHaveBeenCalled();
  });

  it('renders an uncached neutral 404 card when the profile is not found', async () => {
    mocks.creator.mockResolvedValue(null);
    await render();
    const [node, options] = mocks.response.mock.calls[0];
    expect(renderedText(node)).toContain('Release not found');
    expect(options).toMatchObject({ status: 404 });
  });

  it('renders the release title, artist byline and display URL', async () => {
    await render();
    const [node, options] = mocks.response.mock.calls[0];
    const text = renderedText(node);
    expect(text).toContain('Midnight Signal');
    expect(text).toContain('by Maya Vale');
    expect(text).toContain('jov.ie/maya-vale/midnight-signal');
    expect(options).toMatchObject({
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  });

  it('renders without artwork for mystery releases, never revealing the title', async () => {
    mocks.content.mockResolvedValue({
      ...RELEASE_CONTENT,
      releaseDate: null,
    });
    await render();
    const [node, options] = mocks.response.mock.calls[0];
    const text = renderedText(node);
    expect(text).toContain('New music from Maya Vale');
    expect(text).not.toContain('Midnight Signal');
    expect(options).toMatchObject({ status: 200 });
    expect(mocks.image).not.toHaveBeenCalled();
  });

  it('returns a retryable 503 when the share font cannot be loaded', async () => {
    mocks.font.mockRejectedValue(new Error('font unavailable'));
    const response = (await render()) as unknown as Response;
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(503);
  });

  it.each(['not_a_slug!', '../private', 'drop table'])(
    'does not resolve invalid or reserved input: %s',
    async slug => {
      await render('maya-vale', slug);
      expect(mocks.opaque).not.toHaveBeenCalled();
      expect(mocks.content).not.toHaveBeenCalled();
    }
  );

  it('resolves canonical opaque aliases before reading public content', async () => {
    mocks.opaque.mockResolvedValue({ action: 'redirect', handle: 'maya-vale' });
    await render('imported-artist');
    expect(mocks.creator).toHaveBeenCalledWith('maya-vale');
    expect(mocks.content).toHaveBeenCalledWith('profile-1', 'midnight-signal');
  });
});
