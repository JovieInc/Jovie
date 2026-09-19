import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { HOMEPAGE_PROFILE_PREVIEW_TOUR_DATES } from '@/components/features/home/homepage-profile-preview-fixture';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { PublicProfileFixture } from './PublicProfileFixture';

vi.mock('@/app/[username]/_components/PublicClaimBanner', () => ({
  PublicClaimBanner: ({ displayName }: { displayName: string }) => (
    <div data-testid='public-claim-banner'>{displayName}</div>
  ),
}));

vi.mock('@/features/profile/templates/ProfileCompactTemplate', () => ({
  ProfileCompactTemplate: ({
    artist,
    embeddedPreview,
    profileBanner,
    tourDates,
  }: {
    artist: { name: string };
    embeddedPreview: boolean;
    profileBanner: ReactNode;
    tourDates: readonly TourDateViewModel[];
  }) => (
    <div
      data-preview={String(embeddedPreview)}
      data-testid='profile-template'
      data-tour-dates={String(tourDates.length)}
    >
      <h1>{artist.name}</h1>
      {profileBanner}
    </div>
  ),
}));

describe('PublicProfileFixture', () => {
  it('keeps the short unclaimed fixture source-backed', () => {
    render(<PublicProfileFixture />);

    expect(screen.getByTestId('profile-template')).toHaveAttribute(
      'data-preview',
      'false'
    );
    expect(
      screen.getByRole('heading', { name: 'Unfazed' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('public-claim-banner')).toHaveTextContent(
      'Unfazed'
    );
  });

  it('exercises the maximum-name and claimed neighbors', () => {
    render(<PublicProfileFixture longName state='claimed' />);

    expect(
      screen.getByRole('heading', {
        name: 'The Extraordinary Midnight Radio Orchestra',
      })
    ).toBeInTheDocument();
  });

  it('forwards the selected event dataset to the profile template', () => {
    const populatedDates = HOMEPAGE_PROFILE_PREVIEW_TOUR_DATES.slice(0, 1);
    const { rerender } = render(
      <PublicProfileFixture tourDates={populatedDates} />
    );

    expect(screen.getByTestId('profile-template')).toHaveAttribute(
      'data-tour-dates',
      '1'
    );

    rerender(<PublicProfileFixture tourDates={[]} />);

    expect(screen.getByTestId('profile-template')).toHaveAttribute(
      'data-tour-dates',
      '0'
    );
  });
});
