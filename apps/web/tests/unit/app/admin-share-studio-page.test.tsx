import { render, screen } from '@testing-library/react';
import { Children, cloneElement, isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ShareStudioData,
  ShareStudioType,
} from '@/app/app/(shell)/admin/share-studio/loader';
import { buildReleaseShareContext } from '@/lib/share/context';

const mocks = vi.hoisted(() => ({ load: vi.fn(), auth: vi.fn() }));
vi.mock('@/app/app/(shell)/admin/share-studio/loader', () => ({
  loadShareStudioData: mocks.load,
}));
vi.mock('@/lib/admin/page-access', () => ({
  requireCurrentAdminPageAccess: mocks.auth,
}));
vi.mock('@/components/features/admin/layout/AdminPage', () => ({
  AdminPage: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span role='img' aria-label={alt} />,
}));
vi.mock('@/components/features/feedback/PageErrorState', () => ({
  PageErrorState: ({
    title,
    message,
    actionLabel,
  }: {
    title: string;
    message: string;
    actionLabel: string;
  }) => (
    <div role='alert'>
      {title} {message}
      <button type='button'>{actionLabel}</button>
    </div>
  ),
}));

import Page from '@/app/app/(shell)/admin/share-studio/page';

// Resolve the async server nodes before DOM rendering. Client and synchronous
// components still render normally; this tests composition, not RSC streaming.
async function resolveServerNodes(node: ReactNode): Promise<ReactNode> {
  if (!isValidElement<{ children?: ReactNode }>(node)) return node;
  if (
    typeof node.type === 'function' &&
    node.type.constructor.name === 'AsyncFunction'
  ) {
    const server = node.type as (props: unknown) => Promise<ReactNode>;
    return resolveServerNodes(await server(node.props));
  }
  if (!node.props.children) return node;
  const children = await Promise.all(
    Children.toArray(node.props.children).map(resolveServerNodes)
  );
  return cloneElement(node, undefined, ...children);
}

const releaseContext = buildReleaseShareContext({
  username: 'artist',
  slug: 'song',
  title: 'Song',
  artistName: 'Artist',
  artworkUrl: null,
  pathname: '/artist/song',
});
const release: ShareStudioData = {
  urlSearchParams: new URLSearchParams('release=artist%3Asong&blog=news'),
  items: [
    { key: 'artist:song', label: 'Song' },
    { key: 'artist:next', label: 'Next' },
  ],
  selectedKey: 'artist:song',
  context: releaseContext,
  state: 'ready',
};
const empty: ShareStudioData = {
  urlSearchParams: new URLSearchParams(),
  items: [],
  selectedKey: '',
  context: null,
  state: 'empty',
};

async function renderPage() {
  const page = await Page({
    searchParams: Promise.resolve({ release: 'artist:song', blog: 'news' }),
  });
  render(await resolveServerNodes(page));
}

describe('Share preview page composition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue('admin');
    mocks.load.mockImplementation(
      async (_params: unknown, type: ShareStudioType) =>
        type === 'release' ? release : empty
    );
  });
  it('renders a release-only payload and preserves selection in picker links', async () => {
    await renderPage();
    expect(screen.getByText('Release Share Payload')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Song story preview' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open selected release' })
    ).toHaveAttribute('href', releaseContext.canonicalUrl);
    expect(
      screen.getByRole('link', { name: 'Song', exact: true })
    ).toHaveAttribute('aria-current', 'true');
    expect(
      screen
        .getByRole('link', { name: 'Next', exact: true })
        .getAttribute('href')
    ).toContain('release=artist%3Anext&blog=news');
    expect(
      screen.getByText(/No public playlist sample is available/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Download Asset' })
    ).toHaveAttribute('href', releaseContext.asset.url);
    expect(screen.getByText('Tracked Link Outputs')).toBeInTheDocument();
  });
  it('renders a named catalog failure while retaining the valid release', async () => {
    mocks.load.mockImplementation(
      async (_params: unknown, type: ShareStudioType) =>
        type === 'release'
          ? release
          : type === 'blog'
            ? { ...empty, state: 'unavailable' }
            : empty
    );
    await renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Blog preview unavailable'
    );
    expect(
      screen.getByRole('button', { name: 'Retry blog preview' })
    ).toBeInTheDocument();
    expect(screen.getByText('Release Share Payload')).toBeInTheDocument();
  });
  it('requires operator access before loading any catalogs', async () => {
    mocks.auth.mockRejectedValue(new Error('denied'));
    await expect(renderPage()).rejects.toThrow('denied');
    expect(mocks.load).not.toHaveBeenCalled();
  });
});
