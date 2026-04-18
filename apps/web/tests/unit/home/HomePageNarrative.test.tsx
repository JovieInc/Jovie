import { render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { HomePageNarrative } from '@/features/home/HomePageNarrative';

vi.mock('@/features/home/HomeAdaptiveProfileStory', () => ({
  HomeAdaptiveProfileStory: () => (
    <>
      <section data-testid='homepage-hero'>hero</section>
      <section data-testid='homepage-trust'>trust</section>
    </>
  ),
}));

vi.mock('@/features/home/HomeEngageBentoSection', () => ({
  HomeEngageBentoSection: () => (
    <section data-testid='homepage-engage-bento'>
      <h2>Engage.</h2>
      <p>Smart links that stay current.</p>
    </section>
  ),
}));

vi.mock('@/features/home/HomeAutoNotifySection', () => ({
  HomeAutoNotifySection: () => (
    <section data-testid='homepage-auto-notify'>
      <h2>Notify every fan. Automatically.</h2>
    </section>
  ),
}));

vi.mock('@/features/home/HomeFanRelationshipSection', () => ({
  HomeFanRelationshipSection: () => (
    <section data-testid='homepage-fan-relationship'>
      <h2>Turn action into a relationship.</h2>
      <p>Recognize the people who care.</p>
    </section>
  ),
}));

vi.mock('@/features/home/HomeLiveProofSection', () => ({
  HomeLiveProofSection: () => (
    <section data-testid='homepage-live-proof'>live proof</section>
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

  it('renders the reshaped homepage section order', () => {
    render(
      <HomePageNarrative
        proofAvailability='visible'
        proofSection={<section data-testid='mock-proof-section'>proof</section>}
      />
    );

    const hero = screen.getByTestId('homepage-hero');
    const trust = screen.getByTestId('homepage-trust');
    const autoNotify = screen.getByTestId('homepage-auto-notify');
    const engage = screen.getByTestId('homepage-engage-bento');
    const relationship = screen.getByTestId('homepage-fan-relationship');
    const proof = screen.getByTestId('mock-proof-section');
    const finalCta = screen.getByTestId('final-cta-headline');

    expect(hero.compareDocumentPosition(trust)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(trust.compareDocumentPosition(engage)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(engage.compareDocumentPosition(autoNotify)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(autoNotify.compareDocumentPosition(relationship)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(relationship.compareDocumentPosition(proof)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(proof.compareDocumentPosition(finalCta)).toBe(
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
    expect(screen.queryByTestId('homepage-chapter-3')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('homepage-spec-section')
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

  it('renders the render-backed engage and relationship content', () => {
    render(<HomePageNarrative />);

    expect(
      screen.getByRole('heading', { name: 'Notify every fan. Automatically.' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Engage.' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Turn action into a relationship.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Smart links that stay current.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Recognize the people who care.')
    ).toBeInTheDocument();
  });
});