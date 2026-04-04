import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  ProfileFeaturedCard,
  resolveFeaturedContent,
} from '@/features/profile/ProfileFeaturedCard';

vi.mock('@/components/atoms/ImageWithFallback', () => ({
  ImageWithFallback: ({ alt }: { alt: string }) =>
    React.createElement('div', { 'data-testid': 'image-with-fallback' }, alt),
}));

const artist = {
  handle: 'tim',
  name: 'Tim White',
} as const;

describe('resolveFeaturedContent', () => {
  const now = new Date('2026-03-26T12:00:00.000Z');

  it('prioritizes the next upcoming tour date over a release', () => {
    const result = resolveFeaturedContent(
      [
        {
          id: 'tour-early',
          startDate: '2026-03-30T20:00:00.000Z',
          venueName: 'First Venue',
        },
        {
          id: 'tour-later',
          startDate: '2026-04-02T20:00:00.000Z',
          venueName: 'Second Venue',
        },
      ] as any,
      {
        title: 'Latest Release',
        slug: 'latest-release',
        artworkUrl: null,
        releaseDate: '2026-03-20T00:00:00.000Z',
        releaseType: 'single',
      },
      now
    );

    expect(result).toMatchObject({
      kind: 'tour',
      tourDate: { id: 'tour-early' },
    });
  });

  it('falls back to the latest release when no upcoming tour dates exist', () => {
    const result = resolveFeaturedContent(
      [
        {
          id: 'tour-past',
          startDate: '2026-03-01T20:00:00.000Z',
          venueName: 'Past Venue',
        },
      ] as any,
      {
        title: 'Latest Release',
        slug: 'latest-release',
        artworkUrl: null,
        releaseDate: '2026-03-20T00:00:00.000Z',
        releaseType: 'single',
      },
      now
    );

    expect(result).toMatchObject({
      kind: 'release',
      release: { slug: 'latest-release' },
    });
  });

  it('uses the subscribe fallback when neither tour dates nor a release exist', () => {
    expect(resolveFeaturedContent([], null, now)).toEqual({
      kind: 'fallback',
    });
  });

  it('renders a compact release row with a Listen action for V2', () => {
    const onListenClick = vi.fn();

    render(
      React.createElement(ProfileFeaturedCard, {
        artist: artist as never,
        latestRelease: {
          title: 'After Hours',
          slug: 'after-hours',
          artworkUrl: 'https://example.com/release.jpg',
          releaseDate: '2026-03-20T00:00:00.000Z',
          releaseType: 'single',
        },
        tourDates: [],
        dsps: [{ key: 'spotify' } as never],
        variant: 'compact',
        onListenClick,
      })
    );

    expect(screen.getByText('Latest Release')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /listen to after hours/i })
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /listen to after hours/i })
    );

    expect(onListenClick).toHaveBeenCalled();
  });
});
