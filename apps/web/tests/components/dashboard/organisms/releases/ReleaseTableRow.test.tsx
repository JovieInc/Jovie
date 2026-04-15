import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ReleaseTableRow } from '@/features/dashboard/organisms/releases/ReleaseTableRow';
import type { ReleaseViewModel } from '@/lib/discography/types';

vi.mock('@/components/atoms/ReleaseArtworkThumb', () => ({
  ReleaseArtworkThumb: () => <div data-testid='release-artwork-thumb' />,
}));

vi.mock('@/components/molecules/ConfirmDialog', () => ({
  ConfirmDialog: () => null,
}));

vi.mock('@/features/dashboard/organisms/releases/components', () => ({
  AddProviderUrlPopover: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  NotFoundCopyButton: () => null,
  ProviderCopyButton: () => null,
  ProviderStatusDot: () => null,
}));

vi.mock('@/components/atoms/table-action-menu', () => ({
  TableActionMenu: ({
    items,
  }: {
    items: Array<{
      id: string;
      label?: string;
      children?: Array<{ id: string; label?: string }>;
    }>;
  }) => (
    <div data-testid='table-action-menu'>
      {items
        .flatMap(item => [item, ...(item.children ?? [])])
        .map(item =>
          item.label ? <span key={item.id}>{item.label}</span> : null
        )}
    </div>
  ),
}));

vi.mock('@/lib/utils/platform-detection', () => ({
  getBaseUrl: () => 'https://jov.ie',
}));

vi.mock('@/lib/utm', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/utm')>();

  return {
    ...actual,
    buildUTMContext: () => ({}),
    getUTMShareActionMenuItems: () => [],
    getUTMShareContextMenuItems: () => [],
  };
});

describe('ReleaseTableRow', () => {
  it('groups share and metadata actions in the row action menu', () => {
    const release: ReleaseViewModel = {
      profileId: 'profile-1',
      id: 'release-1',
      title: 'Midnight Signal',
      releaseDate: '2026-01-01',
      artworkUrl: 'https://example.com/art.jpg',
      slug: 'midnight-signal',
      smartLinkPath: '/r/midnight-signal',
      providers: [],
      releaseType: 'single',
      isExplicit: false,
      totalTracks: 1,
    };

    render(
      <table>
        <tbody>
          <ReleaseTableRow
            release={release}
            index={0}
            totalRows={1}
            primaryProviders={[]}
            providerConfig={
              {} as Record<
                import('@/lib/discography/types').ProviderKey,
                { label: string; accent: string }
              >
            }
            onCopy={vi.fn().mockResolvedValue('copied')}
            onEdit={vi.fn()}
          />
        </tbody>
      </table>
    );

    expect(screen.getByText('Share link')).toBeInTheDocument();
    expect(screen.getByText('Copy metadata')).toBeInTheDocument();
  });
});
