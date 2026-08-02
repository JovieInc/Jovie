import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfilePacCard } from '@/features/profile/pac/ProfilePacCard';
import { DEFAULT_PROFILE_PAC_ASSIGNMENT } from '@/lib/flags/profile-pac';
import type { Artist } from '@/types/db';

const mockUseTrackAudioPlayer = vi.hoisted(() => vi.fn());

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    prefetch: _prefetch,
    ...props
  }: {
    readonly children: React.ReactNode;
    readonly href: string;
    readonly prefetch?: boolean;
    readonly [key: string]: unknown;
  }) => React.createElement('a', { href, ...props }, children),
}));

vi.mock('@/components/atoms/ImageWithFallback', () => ({
  ImageWithFallback: ({
    alt,
    className,
    priority,
    src,
  }: {
    readonly alt: string;
    readonly className?: string;
    readonly priority?: boolean;
    readonly src: string;
  }) =>
    React.createElement('img', {
      alt,
      className,
      'data-priority': priority ? 'true' : 'false',
      src,
    }),
}));

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => mockUseTrackAudioPlayer(),
}));

vi.mock('@/features/profile/usePacEvents', () => ({
  usePacEvents: () => ({
    exposureRef: vi.fn(),
    emit: vi.fn(),
    createPlayTracker: () => ({
      onPlay: vi.fn(),
      onPause: vi.fn(),
      onTick: vi.fn(),
      onComplete: vi.fn(),
    }),
  }),
}));

vi.mock('@/lib/profile/capture-dismissal-client', () => ({
  getCaptureDismissalStatus: vi.fn().mockResolvedValue(null),
  invalidateCaptureDismissalStatus: vi.fn(),
}));

const artist = {
  id: 'artist-1',
  handle: 'tim',
  name: 'Tim White',
  image_url: '/artist.jpg',
} as Artist;

describe('ProfilePacCard landscape states', () => {
  beforeEach(() => {
    mockUseTrackAudioPlayer.mockReturnValue({
      playbackState: {
        activeTrackId: 'pac-artist-1-release',
        currentTime: 30,
        duration: 60,
        isPlaying: true,
      },
      toggleTrack: vi.fn(),
      seek: vi.fn(),
    });
  });

  it('gives the capture form the full compact row width after the listen threshold', async () => {
    render(
      <ProfilePacCard
        artist={artist}
        release={{
          title: 'Release',
          slug: 'release',
          artworkUrl: '/release.jpg',
          previewUrl: '/preview.mp3',
        }}
        assignment={DEFAULT_PROFILE_PAC_ASSIGNMENT}
        layout='profile-landscape'
        artPriority
      />
    );

    const card = screen.getByTestId('profile-pac');
    await waitFor(() => expect(card).toHaveAttribute('data-state', 'prompt'));

    const email = screen.getByRole('textbox', { name: /email address/i });
    const submit = screen.getByRole('button', { name: 'Get Updates' });
    expect(email).toBeVisible();
    expect(email).toHaveClass('h-11');
    expect(submit).toBeVisible();
    expect(submit).toHaveClass('h-11');
    expect(
      screen.getByRole('img', { name: 'Release artwork' })
    ).toHaveAttribute('data-priority', 'true');
    expect(card.querySelector('.aspect-square')).toHaveClass('invisible');
    const compactContent = screen.getByRole('textbox').closest('.absolute');
    expect(compactContent).toHaveClass('inset-1.5', 'gap-1');
  });

  it('reserves enough compact-row height for subject copy and a 44px action', () => {
    mockUseTrackAudioPlayer.mockReturnValue({
      playbackState: {
        activeTrackId: null,
        currentTime: 0,
        duration: 0,
        isPlaying: false,
      },
      toggleTrack: vi.fn(),
      seek: vi.fn(),
    });

    render(
      <ProfilePacCard
        artist={artist}
        release={{
          title: 'Release',
          slug: 'release',
          artworkUrl: '/release.jpg',
          previewUrl: null,
          releaseType: 'Single',
          releaseDate: '2026-08-02',
        }}
        assignment={DEFAULT_PROFILE_PAC_ASSIGNMENT}
        layout='profile-landscape'
        renderMode='preview'
      />
    );

    const card = screen.getByTestId('profile-pac');
    const compactContent = card.children.item(1);
    expect(compactContent).toHaveClass('gap-1', 'py-1.5');
    expect(screen.getByRole('link', { name: /listen/i })).toHaveClass('h-11');
  });
});
