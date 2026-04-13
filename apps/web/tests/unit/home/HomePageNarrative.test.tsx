import { render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { HomePageNarrative } from '@/features/home/HomePageNarrative';
import { HOME_STORY_SCENES } from '@/features/home/home-scroll-scenes';

class MockIntersectionObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

const matchMediaMock = vi.fn().mockImplementation(() => ({
  matches: false,
  media: '(prefers-reduced-motion: reduce)',
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  onchange: null,
  dispatchEvent: vi.fn(),
}));

describe('HomePageNarrative', () => {
  const originalIntersectionObserver = globalThis.IntersectionObserver;
  const originalMatchMedia = globalThis.matchMedia;

  beforeAll(() => {
    // @ts-expect-error test shim
    globalThis.IntersectionObserver = MockIntersectionObserver;
    // @ts-expect-error test shim
    globalThis.matchMedia = matchMediaMock;
  });

  afterAll(() => {
    globalThis.IntersectionObserver = originalIntersectionObserver;
    globalThis.matchMedia = originalMatchMedia;
  });

  it('renders the new hero, scenes, infrastructure section, and final CTA', () => {
    render(<HomePageNarrative />);

    const eyebrow = screen.getAllByText('For artists')[0];
    const heading = screen.getAllByRole('heading', {
      name: 'The link your music deserves.',
    })[0];
    const subhead = screen.getAllByText(
      'One artist profile that updates itself for every release and notifies fans automatically.'
    )[0];
    const vanityUrl = screen.getAllByTestId('homepage-hero-url-lockup')[0];
    const primaryCta = screen.getAllByRole('link', {
      name: 'Claim your profile',
    })[0];

    expect(eyebrow.compareDocumentPosition(heading)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(heading.compareDocumentPosition(subhead)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(subhead.compareDocumentPosition(vanityUrl)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(vanityUrl.compareDocumentPosition(primaryCta)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );

    expect(vanityUrl).toHaveTextContent('jov.ie/you');

    for (const scene of HOME_STORY_SCENES) {
      expect(
        screen.getAllByRole('heading', { name: scene.headline }).length
      ).toBeGreaterThan(0);
    }

    expect(
      screen.getByRole('heading', { name: 'Runs itself underneath.' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Claim your profile.' })
    ).toBeInTheDocument();
  });

  it('removes the old homepage framing', () => {
    render(<HomePageNarrative />);

    expect(
      screen.queryByRole('heading', { name: 'Profiles that convert.' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: 'Share every release. Reach every fan. Automatically.',
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: 'A command center for your career.',
      })
    ).not.toBeInTheDocument();
  });

  it('keeps proof hidden by default', () => {
    render(<HomePageNarrative />);

    expect(screen.queryByTestId('homepage-live-proof')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('homepage-secondary-cta')
    ).not.toBeInTheDocument();
  });

  it('renders the proof slot when proof is enabled', () => {
    render(
      <HomePageNarrative
        proofAvailability='visible'
        proofSection={<div data-testid='mock-proof-section'>proof</div>}
      />
    );

    expect(screen.getByTestId('mock-proof-section')).toBeInTheDocument();
  });
});
