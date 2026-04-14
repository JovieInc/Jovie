import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ArtistProfilesPage from '@/app/(marketing)/artist-profiles/page';
import { getCanonicalSurface } from '@/lib/canonical-surfaces';

vi.mock('@/constants/app', async importOriginal => {
  const actual = await importOriginal<typeof import('@/constants/app')>();
  return {
    ...actual,
    APP_NAME: 'Jovie',
    BASE_URL: 'https://jov.ie',
  };
});

vi.mock('@/features/home/StickyPhoneTour', () => ({
  StickyPhoneTour: (props: Record<string, unknown>) => (
    <div data-testid='sticky-phone-tour'>{String(props.introTitle ?? '')}</div>
  ),
}));

describe('ArtistProfilesPage', () => {
  it('renders the text-only hero with headline and phone tour', () => {
    render(<ArtistProfilesPage />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'One link. Every release.',
      })
    ).toBeInTheDocument();
    expect(screen.getByTestId('sticky-phone-tour')).toBeInTheDocument();
    expect(screen.getByTestId('final-cta-section')).toBeInTheDocument();
    expect(screen.getByTestId('final-cta-headline')).toHaveTextContent(
      'Claim your profile.'
    );
  });

  it('passes artist-profile modes to the phone tour', () => {
    render(<ArtistProfilesPage />);

    expect(screen.getByTestId('sticky-phone-tour')).toHaveTextContent(
      'Your profile adapts to what matters right now.'
    );
  });

  it('links the profile example CTA to the canonical public-profile review route', () => {
    render(<ArtistProfilesPage />);

    expect(
      screen.getByRole('link', { name: 'See a live example' })
    ).toHaveAttribute(
      'href',
      getCanonicalSurface('public-profile').reviewRoute
    );
  });
});
