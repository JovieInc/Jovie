import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomeAdaptiveProfileStory } from './HomeAdaptiveProfileStory';

vi.mock('@/lib/flags/marketing-static', () => ({
  FEATURE_FLAGS: { SHOW_LOGO_BAR: true },
}));

vi.mock('./HomeHeroCTA', () => ({
  HomeHeroCTA: () => (
    <div data-testid='homepage-claim-form'>
      <span>jov.ie/</span>
      <button type='button'>Claim your profile</button>
    </div>
  ),
}));

vi.mock('./HomeHeroPhoneComposition', () => ({
  HomeHeroPhoneComposition: () => (
    <div data-testid='homepage-hero-composition'>phone composition</div>
  ),
}));

vi.mock('./HomeTrustSection', () => ({
  HomeTrustSection: () => (
    <section data-testid='homepage-trust'>trusted logo strip</section>
  ),
}));

describe('HomeAdaptiveProfileStory', () => {
  it('renders the bounded homepage hero and trust strip receipt', () => {
    render(<HomeAdaptiveProfileStory />);

    const shell = screen.getByTestId('homepage-shell');
    const claimForm = screen.getByTestId('homepage-claim-form');
    const heroComposition = screen.getByTestId('homepage-hero-composition');
    const trustStrip = screen.getByTestId('homepage-trust');

    expect(shell).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'The link your music deserves.',
      })
    ).toHaveClass('line-clamp-2');
    expect(claimForm).toBeInTheDocument();
    expect(heroComposition).toBeInTheDocument();
    expect(trustStrip).toBeInTheDocument();
  });
});
