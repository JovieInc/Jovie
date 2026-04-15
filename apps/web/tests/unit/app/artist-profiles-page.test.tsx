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

  it('renders the homepage hero and all sections ungated', () => {
    render(<ArtistProfilesPage />);

    expect(screen.getByTestId('homepage-hero')).toBeInTheDocument();
    expect(screen.getByText('One profile.')).toBeInTheDocument();
    expect(screen.getByTestId('homepage-chapter-1')).toBeInTheDocument();
    expect(screen.getByTestId('homepage-chapter-2')).toBeInTheDocument();
    expect(screen.getByTestId('homepage-trust')).toBeInTheDocument();
    expect(screen.getByTestId('homepage-chapter-3')).toBeInTheDocument();
    expect(screen.getByTestId('sticky-phone-tour')).toBeInTheDocument();
    expect(screen.getByTestId('homepage-auto-notify')).toBeInTheDocument();
    expect(screen.getByTestId('homepage-engage-bento')).toBeInTheDocument();
    expect(screen.getByTestId('homepage-spec-section')).toBeInTheDocument();
    expect(screen.getByTestId('final-cta-section')).toBeInTheDocument();
  });

  it('uses the artist profile CTA copy', () => {
    render(<ArtistProfilesPage />);

    expect(screen.getByTestId('final-cta-headline')).toHaveTextContent(
      'Claim your profile.'
    );
  });
});
