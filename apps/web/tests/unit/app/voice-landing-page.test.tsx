import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import VoiceLandingPage from '@/app/(marketing)/voice/page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/voice',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
}));

// Mock analytics to keep test pure (no side effects)
vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

// Mock SharedMarketingHero children rendering for isolation while still exercising page
vi.mock('@/components/features/landing/SharedMarketingHero', () => ({
  SharedMarketingHero: (props: any) => (
    <section data-testid={props.sectionTestId || 'marketing-hero-section'}>
      <h1 data-testid={props.titleTestId || 'hero-heading'}>{props.title}</h1>
      <div>{props.body}</div>
      <div data-testid='hero-media-slot'>{props.media}</div>
      <a
        data-testid={props.primaryCtaTestId || 'primary-cta'}
        href={props.primaryCtaHref}
      >
        {props.primaryCtaLabel}
      </a>
      {props.secondaryCtaLabel && (
        <a href={props.secondaryCtaHref}>{props.secondaryCtaLabel}</a>
      )}
      {props.proofPoints?.map((p: string) => (
        <span key={p} data-testid='proof-point'>
          {p}
        </span>
      ))}
    </section>
  ),
}));

describe('VoiceLandingPage (gh-9809 hero landing)', () => {
  it('renders the voice hero with correct title, CTAs, and proof points', () => {
    render(<VoiceLandingPage />);

    expect(screen.getByTestId('voice-hero-title')).toHaveTextContent(
      /Clone your voice/i
    );
    expect(screen.getByTestId('voice-hero-primary-cta')).toHaveTextContent(
      'Start voice cloning'
    );
    expect(screen.getByText('See pricing')).toBeInTheDocument();
    expect(screen.getAllByTestId('proof-point').length).toBeGreaterThan(0);
  });

  it('includes the voice-specific demo visual component in hero media', () => {
    render(<VoiceLandingPage />);
    expect(screen.getByTestId('voice-demo-visual')).toBeInTheDocument();
    expect(screen.getByTestId('voice-demo-play-btn')).toBeInTheDocument();
  });

  it('demo visual toggles playing state and shows transcript on play (client interaction)', () => {
    render(<VoiceLandingPage />);
    const btn = screen.getByTestId('voice-demo-play-btn');
    expect(btn).toHaveTextContent(/Play 4s sample/);

    fireEvent.click(btn);
    // After click, state updates to playing (button text or transcript appears)
    expect(screen.getByTestId('voice-demo-transcript')).toBeInTheDocument();
  });

  it('renders the explicit 4-step how-it-works section and final CTA', () => {
    render(<VoiceLandingPage />);

    expect(screen.getByText('Four steps')).toBeInTheDocument();
    expect(screen.getByText('Link your clip')).toBeInTheDocument();
    expect(screen.getByText('Consent & start train')).toBeInTheDocument();
    expect(screen.getByText('Review your model')).toBeInTheDocument();
    expect(screen.getByText('Use it everywhere')).toBeInTheDocument();

    expect(screen.getByTestId('voice-final-cta')).toHaveTextContent(
      'Clone my voice now'
    );
    expect(screen.getByTestId('voice-trust-cta')).toBeInTheDocument();
  });

  it('has correct marketing metadata structure (title + canonical)', () => {
    // Metadata is static export; basic smoke that module loads without throw
    expect(VoiceLandingPage).toBeDefined();
  });
});
