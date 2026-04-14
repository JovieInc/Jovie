import { render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { HomeAdaptiveProfileStory } from '@/features/home/HomeAdaptiveProfileStory';

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
  });

  it('renders chapter 1 with sandbox card', () => {
    render(<HomeAdaptiveProfileStory />);

    expect(
      screen.getByRole('heading', { name: 'Turn attention into action.' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('homepage-sandbox')).toBeInTheDocument();
  });

  it('renders chapter 2 with tip bento card', () => {
    render(<HomeAdaptiveProfileStory />);

    expect(
      screen.getByRole('heading', {
        name: 'Get paid.',
      })
    ).toBeInTheDocument();
    expect(screen.getByText("That's it.")).toBeInTheDocument();
  });

  it('does not render old sections', () => {
    const { container } = render(<HomeAdaptiveProfileStory />);

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
