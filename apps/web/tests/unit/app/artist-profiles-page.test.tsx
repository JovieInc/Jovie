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

vi.mock('@/features/home/claim-handle', () => ({
  ClaimHandleForm: () => (
    <div data-testid='claim-handle-form'>claim handle form</div>
  ),
}));

describe('ArtistProfilesPage', () => {
  it('renders the marketing-native hero and CTA flow', () => {
    render(<ArtistProfilesPage />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'A profile that looks like you meant it.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('artist-profiles-hero-surface')
    ).toBeInTheDocument();
    expect(screen.getByTestId('artist-profiles-cta-form')).toBeInTheDocument();
    expect(screen.getByTestId('claim-handle-form')).toBeInTheDocument();
  });

  it('links the profile example CTA to the canonical public-profile review route', () => {
    render(<ArtistProfilesPage />);

    expect(
      screen.getByRole('link', { name: 'See profile example' })
    ).toHaveAttribute(
      'href',
      getCanonicalSurface('public-profile').reviewRoute
    );
  });
});
