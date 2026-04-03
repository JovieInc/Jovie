import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  DrawerSurfaceCard: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
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
  it('renders playback summary and expanded provider grouping', async () => {
    const user = userEvent.setup();
    const release = createMockRelease();

    render(
      <ReleaseTrackList
        release={release}
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
            previewSource: null,
            previewVerification: 'missing',
            providerConfidenceSummary: {
              canonical: 1,
              searchFallback: 1,
              unknown: 2,
              unresolvedProviders: ['apple_music', 'youtube'],
            },
            providers: [
              {
                key: 'spotify',
                label: 'Spotify',
                url: 'https://open.spotify.com/track/123',
                confidence: 'canonical',
              },
              {
                key: 'soundcloud',
                label: 'SoundCloud',
                url: 'https://soundcloud.com/track/123',
                confidence: 'search_fallback',
              },
            ],
          },
        ]}
      />
    );

    expect(screen.getByTestId('release-preview-summary')).toHaveTextContent(
      'Audio Previews: none'
    );
    expect(
      screen.getByTestId('release-track-status-track_1')
    ).toHaveTextContent('Not checked');
    expect(
      screen.getByTestId('release-track-provider-summary-track_1')
    ).toHaveTextContent('1 linked, 1 unconfirmed, 2 pending');

    const disclosure = screen.getByRole('button', { expanded: false });

    await user.click(disclosure);

    expect(
      screen.getByTestId('release-track-canonical-providers-track_1')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('release-track-fallback-providers-track_1')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('release-track-unresolved-track_1')
    ).toHaveTextContent('Unresolved: Apple Music, YouTube');
  });
});
