import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HOMEPAGE_PROFILE_PREVIEW_TOUR_DATES } from '@/components/features/home/homepage-profile-preview-fixture';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { PublicProfileFixture } from './PublicProfileFixture';

vi.mock('@/features/profile/ClaimBanner', () => ({
  ClaimBanner: ({
    displayName,
    prefetch,
    variant,
  }: {
    displayName: string;
    prefetch?: boolean;
    variant?: string;
  }) => (
    <div
      data-testid='public-claim-banner'
      data-prefetch={String(prefetch)}
      data-variant={variant}
    >
      {displayName}
    </div>
  ),
}));

vi.mock('@/features/profile/templates/ProfileCompactTemplate', () => ({
  ProfileCompactTemplate: ({
    artist,
    embeddedPreview,
    profileBanner,
    tourDates,
    showPayButton,
    releaseCredits,
  }: {
    artist: { name: string };
    embeddedPreview: boolean;
    profileBanner: ReactNode;
    tourDates: readonly TourDateViewModel[];
    showPayButton?: boolean;
    releaseCredits?: readonly unknown[];
  }) => (
    <div
      data-preview={String(embeddedPreview)}
      data-testid='profile-template'
      data-tour-dates={String(tourDates.length)}
      data-show-pay={String(Boolean(showPayButton))}
      data-release-credits={String(releaseCredits?.length ?? 0)}
    >
      <h1>{artist.name}</h1>
      {profileBanner}
    </div>
  ),
}));

describe('PublicProfileFixture', () => {
  it('paints the profile content in server HTML before JavaScript runs', () => {
    const html = renderToString(<PublicProfileFixture state='claimed' />);
    expect(html).toContain('data-testid="profile-template"');
    expect(html).toContain('<h1>Unfazed</h1>');
  });
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
    expect(screen.getByTestId('public-claim-banner')).toHaveAttribute(
      'data-prefetch',
      'false'
    );
    expect(screen.getByTestId('profile-template')).toHaveAttribute(
      'data-show-pay',
      'true'
    );
    expect(screen.getByTestId('profile-template')).toHaveAttribute(
      'data-release-credits',
      '1'
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

  it('exercises direct claim intent without changing the verified-claim default', () => {
    const previousHref = window.location.href;
    window.history.replaceState(null, '', '/unfazed?claim=1');
    try {
      const { rerender } = render(
        <PublicProfileFixture state='unclaimed-direct' />
      );
      expect(screen.getByTestId('public-claim-banner')).toHaveAttribute(
        'data-variant',
        'claim_intent'
      );
      act(() => window.history.replaceState(null, '', '/unfazed'));
      expect(screen.getByTestId('public-claim-banner')).toHaveAttribute(
        'data-variant',
        'organic'
      );
      rerender(<PublicProfileFixture />);
      expect(screen.getByTestId('public-claim-banner')).toHaveAttribute(
        'data-variant',
        'verified_claim'
      );
    } finally {
      window.history.replaceState(null, '', previousHref);
    }
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
