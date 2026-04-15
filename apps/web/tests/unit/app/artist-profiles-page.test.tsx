import { render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import ArtistProfilesPage from '@/app/(marketing)/artist-profiles/page';

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
  const originalMatchMedia = globalThis.matchMedia;

  beforeAll(() => {
    // @ts-expect-error test shim
    globalThis.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }));
  });

  afterAll(() => {
    globalThis.matchMedia = originalMatchMedia;
  });

  it('renders the homepage hero with headline and CTA', () => {
    render(<ArtistProfilesPage />);

    expect(screen.getByTestId('homepage-hero')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'The link your music deserves.',
      })
    ).toBeInTheDocument();
    expect(screen.getByTestId('final-cta-section')).toBeInTheDocument();
    expect(screen.getByTestId('final-cta-headline')).toHaveTextContent(
      'Stay in the studio.'
    );
  });

  it('renders the claim form CTA in the hero', () => {
    render(<ArtistProfilesPage />);

    expect(screen.getByTestId('homepage-claim-form')).toBeInTheDocument();
  });
});
