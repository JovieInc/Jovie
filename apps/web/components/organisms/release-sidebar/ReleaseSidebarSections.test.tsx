import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/atoms/Icon', () => ({
  Icon: ({ name }: { readonly name: string }) => (
    <span data-testid={`icon-${name}`} />
  ),
}));

vi.mock('@/components/atoms/DspLogo', () => ({
  DSP_LOGO_CONFIG: {},
}));

vi.mock('@/components/molecules/drawer', () => ({
  DrawerAsyncToggle: () => null,
  DrawerFormGridRow: ({
    children,
  }: {
    readonly children?: React.ReactNode;
  }) => <div>{children}</div>,
  DrawerMediaThumb: () => null,
  DrawerSection: ({ children }: { readonly children?: React.ReactNode }) => (
    <section>{children}</section>
  ),
  DrawerSurfaceCard: ({
    children,
    testId,
  }: {
    readonly children?: React.ReactNode;
    readonly testId?: string;
  }) => <div data-testid={testId}>{children}</div>,
}));

vi.mock('@/components/organisms/AvatarUploadable', () => ({
  AvatarUploadable: () => null,
}));

vi.mock('@/components/shell/DrawerHero', () => ({
  DrawerHero: ({ children }: { readonly children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@/components/shell/DropDateChip', () => ({
  DropDateChip: () => null,
}));

vi.mock('@/components/shell/DspAvatarStack', () => ({
  DspAvatarStack: () => null,
}));

vi.mock('@/components/shell/MetaPill', () => ({
  MetaPill: ({ children }: { readonly children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock('@/components/shell/StatusBadge', () => ({
  StatusBadge: () => null,
}));

vi.mock('@/components/shell/TypeBadge', () => ({
  TypeBadge: () => null,
}));

vi.mock('@/features/release/AlbumArtworkContextMenu', () => ({
  AlbumArtworkContextMenu: ({
    children,
  }: {
    readonly children?: React.ReactNode;
  }) => <div>{children}</div>,
  buildArtworkSizes: () => ({}),
}));

import { ReleaseEntityHeader } from './ReleaseSidebarSections';
import type { Release } from './types';

const mockRelease = {
  id: 'rel_1',
  title: 'Midnight Drive',
  artistNames: ['Example Artist'],
  releaseType: 'single',
  releaseDate: '2026-01-15',
  totalTracks: 1,
  artworkUrl: 'https://placehold.co/400x400',
  links: [],
} as unknown as Release;

describe('ReleaseSidebarSections', () => {
  it('renders release entity header title', () => {
    render(
      <ReleaseEntityHeader
        release={mockRelease}
        artistName='Example Artist'
        providerConfig={{}}
        canUploadArtwork={false}
        canRevertArtwork={false}
        allowDownloads={false}
        previewUrl={null}
        isPlaying={false}
        onTogglePreview={() => undefined}
      />
    );

    expect(screen.getByTestId('release-header-card')).toBeTruthy();
    expect(screen.getByText('Midnight Drive')).toBeTruthy();
  });
});
