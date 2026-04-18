import { render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { HomeAdaptiveProfileStory } from '@/features/home/HomeAdaptiveProfileStory';

vi.mock('@/features/home/HomeHeroCTA', () => ({
  HomeHeroCTA: () => (
    <div data-testid='homepage-claim-form'>
      <span>jov.ie/</span>
      <button type='button'>Claim your profile</button>
    </div>
  ),
}));

vi.mock('@/features/home/HomeHeroPhoneComposition', () => ({
  HomeHeroPhoneComposition: () => (
    <div data-testid='homepage-hero-composition'>
      <div data-testid='homepage-phone-state-catalog'>phone states</div>
    </div>
  ),
}));

vi.mock('@/features/home/HomeTrustSection', () => ({
  HomeTrustSection: () => (
    <section data-testid='homepage-trust'>Trusted by artists on</section>
  ),
}));

vi.mock('next/navigation', async importOriginal => {
  const actual = await importOriginal<typeof import('next/navigation')>();

  return {
    ...actual,
    useRouter: vi.fn(() => ({
      push: vi.fn(),
      replace: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
    })),
    usePathname: vi.fn(() => '/'),
    useSearchParams: vi.fn(() => new URLSearchParams()),
  };
});
vi.mock('@/lib/feature-flags/shared', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/feature-flags/shared')>();
  return {
    ...actual,
    FEATURE_FLAGS: { ...actual.FEATURE_FLAGS, SHOW_HOMEPAGE_SECTIONS: true },
  };
});

describe('HomeAdaptiveProfileStory', () => {
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

  it('renders the hero with phone render, headline, and pill CTA', () => {
    render(<HomeAdaptiveProfileStory />);

    expect(
      screen.getByRole('heading', {
        name: 'The link your music deserves.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Streams, drops, tips, bookings, and fan capture in a single page.'
      )
    ).toBeInTheDocument();
    expect(screen.getByTestId('homepage-claim-form')).toBeInTheDocument();
    expect(screen.getByText('jov.ie/')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Claim your profile' })
    ).toBeInTheDocument();

    expect(screen.getByTestId('homepage-hero-composition')).toBeInTheDocument();
    expect(
      screen.getByTestId('homepage-phone-state-catalog')
    ).toBeInTheDocument();
  });

  it('renders the trust logo strip', () => {
    render(<HomeAdaptiveProfileStory />);

    expect(screen.getByTestId('homepage-trust')).toBeInTheDocument();
    expect(screen.getByText('Trusted by artists on')).toBeInTheDocument();
  });

  it('renders the trust logo strip when sections are enabled', () => {
    render(<HomeAdaptiveProfileStory />);

    expect(screen.getByTestId('homepage-trust')).toBeInTheDocument();
  });

  it('keeps the hero isolated from the deeper middle sections', () => {
    const { container } = render(<HomeAdaptiveProfileStory />);

    expect(
      screen.queryByRole('heading', { name: 'Turn attention into action.' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Get paid.' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('homepage-interstitial')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('homepage-action-rail')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('homepage-notifications-section')
    ).not.toBeInTheDocument();
    expect(container.querySelector('.homepage-primary-progress')).toBeNull();
  });
});