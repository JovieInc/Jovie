import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLoadShareStudioData } = vi.hoisted(() => ({
  mockLoadShareStudioData: vi.fn(),
}));

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span role='img' aria-label={alt} />,
}));

vi.mock('@/components/features/admin/layout/AdminPage', () => ({
  AdminPage: ({
    children,
    title,
    testId,
  }: {
    children: ReactNode;
    title: string;
    testId: string;
  }) => (
    <section data-testid={testId} data-page-title={title}>
      {children}
    </section>
  ),
}));

vi.mock('@/lib/admin/page-access', () => ({
  requireCurrentAdminPageAccess: vi.fn().mockResolvedValue('admin-user'),
}));

vi.mock('@/app/app/(shell)/admin/share-studio/loader', () => ({
  loadShareStudioData: mockLoadShareStudioData,
}));

const CONTEXT = {
  surfaceType: 'release' as const,
  title: 'Neon Sky',
  canonicalUrl: 'https://jov.ie/creator/neon-sky',
  displayUrl: 'jov.ie/creator/neon-sky',
  imageUrl: null,
  preparedText: 'Listen to Neon Sky',
  emailSubject: 'Neon Sky is out',
  emailBody: 'Listen now.',
  asset: {
    kind: 'story' as const,
    url: '/story.png',
    fileName: 'story.png',
    mimeType: 'image/png' as const,
    width: 1080 as const,
    height: 1920 as const,
  },
  utmContext: {
    baseUrl: 'https://jov.ie/creator/neon-sky',
    releaseSlug: 'neon-sky',
  },
};

describe('AdminShareStudioPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadShareStudioData.mockResolvedValue(null);
  });

  it('renders the canonical source-content empty state', async () => {
    const { default: AdminShareStudioPage } = await import(
      '@/app/app/(shell)/admin/share-studio/page'
    );

    render(await AdminShareStudioPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByTestId('admin-share-studio-page')).toHaveAttribute(
      'data-page-title',
      'Share Studio'
    );
    expect(
      screen.getByRole('heading', {
        name: 'Share Studio needs source content',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/at least one real blog post, public profile, release/)
    ).toBeInTheDocument();
  });

  it('preserves picker selection and payload download behavior', async () => {
    mockLoadShareStudioData.mockResolvedValue({
      urlSearchParams: new URLSearchParams(),
      blogItems: [{ key: 'blog-1', label: 'Blog sample' }],
      profileItems: [{ key: 'profile-1', label: 'Profile sample' }],
      releaseItems: [{ key: 'release-1', label: 'Release sample' }],
      playlistItems: [{ key: 'playlist-1', label: 'Playlist sample' }],
      selectedBlogKey: 'blog-1',
      selectedProfileKey: 'profile-1',
      selectedReleaseKey: 'release-1',
      selectedPlaylistKey: 'playlist-1',
      blogContext: { ...CONTEXT, surfaceType: 'blog' },
      profileContext: { ...CONTEXT, surfaceType: 'profile' },
      releaseContext: CONTEXT,
      playlistContext: { ...CONTEXT, surfaceType: 'playlist' },
    });
    const { default: AdminShareStudioPage } = await import(
      '@/app/app/(shell)/admin/share-studio/page'
    );

    render(await AdminShareStudioPage({ searchParams: Promise.resolve({}) }));

    for (const name of [
      'Blog sample',
      'Profile sample',
      'Release sample',
      'Playlist sample',
    ]) {
      expect(screen.getByRole('link', { name })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
    }
    expect(
      screen.getAllByRole('link', { name: 'Download Asset' })
    ).toHaveLength(4);
    expect(screen.getAllByText('Prepared Text')).toHaveLength(4);
  });
});
