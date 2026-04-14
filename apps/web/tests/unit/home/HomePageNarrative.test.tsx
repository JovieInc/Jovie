import { render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { HomePageNarrative } from '@/features/home/HomePageNarrative';

vi.mock('@/lib/feature-flags/shared', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/feature-flags/shared')>();
  return {
    ...actual,
    FEATURE_FLAGS: { ...actual.FEATURE_FLAGS, SHOW_HOMEPAGE_SECTIONS: true },
  };
});

describe('HomePageNarrative', () => {
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

  it('renders the 7-chapter section order', () => {
    render(<HomePageNarrative />);

    const hero = screen.getByTestId('homepage-hero');
    const trust = screen.getByTestId('homepage-trust');
    const ch1 = screen.getByTestId('homepage-chapter-1');
    const ch2 = screen.getByTestId('homepage-chapter-2');
    const ch3 = screen.getByTestId('homepage-chapter-3');
    const philosophy = screen.getByTestId('homepage-spec-section');
    const finalCta = screen.getByTestId('final-cta-headline');

    expect(hero.compareDocumentPosition(ch1)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(ch1.compareDocumentPosition(ch2)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(ch2.compareDocumentPosition(trust)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(trust.compareDocumentPosition(ch3)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(ch3.compareDocumentPosition(philosophy)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(philosophy.compareDocumentPosition(finalCta)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it('removes the old sections', () => {
    render(<HomePageNarrative />);

    expect(
      screen.queryByTestId('homepage-interstitial')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('homepage-one-profile-section')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('homepage-action-rail')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: 'Algorithms reward consistency.',
      })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Built into the link.' })
    ).not.toBeInTheDocument();
  });

  it('renders the final CTA with a single pill button', () => {
    render(<HomePageNarrative />);

    expect(screen.getByTestId('final-cta-headline')).toHaveTextContent(
      'Stay in the studio.'
    );
    expect(screen.getByTestId('final-cta-action')).toHaveTextContent(
      'Start free trial'
    );
    expect(screen.queryByTestId('final-cta-secondary')).not.toBeInTheDocument();
  });

  it('keeps proof hidden by default', () => {
    render(<HomePageNarrative />);
    expect(screen.queryByTestId('homepage-live-proof')).not.toBeInTheDocument();
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
