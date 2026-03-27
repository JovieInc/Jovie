import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ReleaseTrackList } from '@/components/organisms/release-sidebar/ReleaseTrackList';
import { createMockRelease } from '@/tests/test-utils/factories';

vi.mock('@jovie/ui', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type='button' onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSubTrigger: ({ children }: { children: React.ReactNode }) => (
    <button type='button'>{children}</button>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@/components/atoms/CopyableMonospaceCell', () => ({
  CopyableMonospaceCell: ({ value }: { value: string | null }) => (
    <span>{value}</span>
  ),
}));

vi.mock('@/components/atoms/ProviderIcon', () => ({
  ProviderIcon: ({ provider }: { provider: string }) => (
    <span data-testid={`provider-icon-${provider}`}>{provider}</span>
  ),
}));

vi.mock('@/components/atoms/SeekBar', () => ({
  SeekBar: () => <div data-testid='seek-bar' />,
}));

vi.mock('@/components/atoms/TruncatedText', () => ({
  TruncatedText: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@/components/molecules/drawer', () => ({
  CollapsibleSectionHeading: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DrawerEmptyState: ({ message }: { message: string }) => <div>{message}</div>,
  DrawerInlineIconButton: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
  DrawerSection: ({ children }: { children: React.ReactNode }) => (
    <section>{children}</section>
  ),
  DrawerSurfaceCard: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@/lib/queries', () => ({
  useReleaseTracksQuery: () => ({
    data: null,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => ({
    playbackState: {
      activeTrackId: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
    },
    toggleTrack: vi.fn().mockResolvedValue(undefined),
    seek: vi.fn(),
  }),
}));

describe('ReleaseTrackList', () => {
  it('shows provider icons in the track platform submenu', () => {
    const release = createMockRelease();

    render(
      <ReleaseTrackList
        release={release}
        showHeading={false}
        tracksOverride={[
          {
            id: 'track_1',
            releaseId: release.id,
            releaseSlug: release.slug,
            title: 'Static Skies',
            slug: 'static-skies',
            smartLinkPath: `${release.smartLinkPath}/static-skies`,
            trackNumber: 1,
            discNumber: 1,
            durationMs: 185000,
            isrc: 'USRC17607839',
            isExplicit: false,
            previewUrl: null,
            audioUrl: null,
            audioFormat: null,
            providers: [
              {
                key: 'spotify',
                label: 'Spotify',
                url: 'https://open.spotify.com/track/123',
              },
            ],
          },
        ]}
      />
    );

    expect(
      screen.getByRole('button', { name: /open on platform/i })
    ).toBeInTheDocument();
    expect(screen.getByTestId('provider-icon-spotify')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /spotify/i })
    ).toBeInTheDocument();
  });
});
