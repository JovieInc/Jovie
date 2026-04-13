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

  it('renders the new hero, grouped chapters, lower sections, and final CTA', () => {
    render(<HomePageNarrative />);

    const heading = screen.getAllByRole('heading', {
      name: 'The link your music deserves.',
    })[0];
    const subhead = screen.getAllByText(
      'Drive more streams automatically, notify every fan every time, and get paid from one profile that updates itself.'
    )[0];
    const vanityUrl = screen.getAllByTestId('homepage-hero-url-lockup')[0];
    const primaryCta = screen.getAllByRole('link', {
      name: 'Claim your profile',
    })[0];

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

    expect(
      screen.getAllByRole('heading', { name: HOME_STORY_SCENES[0].headline })
    ).toHaveLength(2);
    expect(
      screen.getAllByRole('heading', {
        name: 'Notify every fan every time.',
      })
    ).toHaveLength(2);
    expect(
      screen.getAllByRole('heading', { name: 'Get paid.' }).length
    ).toBeGreaterThanOrEqual(2);
    expect(
      screen.getAllByRole('heading', { name: 'Say thanks.' }).length
    ).toBeGreaterThan(0);

    expect(
      screen.getByRole('heading', { name: 'Keep the momentum going.' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Keep every door open.' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Opinionated where it counts.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Claim your profile.' })
    ).toBeInTheDocument();
  });

  it('removes the old homepage framing', () => {
    render(<HomePageNarrative />);

    expect(
      screen.queryByRole('heading', { name: 'One link. Every release.' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: 'What one link should do.',
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: 'Built for the release cycle.',
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
