import { render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ReleaseArtwork } from '@/components/organisms/release-sidebar/ReleaseArtwork';

vi.mock('next/image', () => ({
  default: (props: ComponentProps<'img'>) => <img alt='' {...props} />,
}));

vi.mock('@/components/molecules/drawer', () => ({
  EntityHeaderCard: ({ image }: { image: ReactNode }) => (
    <div data-testid='entity-header-card'>{image}</div>
  ),
  DrawerMediaThumb: ({
    children,
    fallback,
  }: {
    children?: ReactNode;
    fallback?: ReactNode;
  }) => <div data-testid='drawer-media-thumb'>{children ?? fallback}</div>,
}));

vi.mock('@/features/release/AlbumArtworkContextMenu', () => ({
  AlbumArtworkContextMenu: ({ children }: { children: ReactNode }) => (
    <div data-testid='album-artwork-context-menu'>{children}</div>
  ),
  buildArtworkSizes: vi.fn(() => []),
}));

vi.mock('@/components/organisms/AvatarUploadable', () => ({
  AvatarUploadable: ({ rounded }: { rounded?: string }) => (
    <div data-testid='avatar-uploadable' data-rounded={rounded ?? 'default'} />
  ),
}));

describe('ReleaseArtwork', () => {
  it('renders release artwork uploadable as rounded square', () => {
    render(
      <ReleaseArtwork
        artworkUrl='https://example.com/release.jpg'
        title='Midnight Echo'
        canUploadArtwork
        onArtworkUpload={async () => 'https://example.com/updated.jpg'}
      />
    );

    expect(screen.getByTestId('avatar-uploadable')).toHaveAttribute(
      'data-rounded',
      'md'
    );
  });

  it('renders drawer media thumb fallback when artwork is missing', () => {
    render(
      <ReleaseArtwork
        artworkUrl={null}
        title='Midnight Echo'
        canUploadArtwork={false}
      />
    );

    expect(screen.getByTestId('drawer-media-thumb')).toBeInTheDocument();
  });
});
