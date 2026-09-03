import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MarketingHero } from '@/components/marketing/MarketingHero';

vi.mock('@/components/features/landing/LandingCTAButton', () => ({
  LandingCTAButton: ({
    eventName,
    label,
    testId,
  }: Readonly<{
    eventName: string;
    label: string;
    testId?: string;
  }>) => (
    <button
      type='button'
      data-event-name={eventName}
      data-testid={testId ?? 'cta-button'}
    >
      {label}
    </button>
  ),
}));

vi.mock('@/components/features/home/HomeTrustSection', () => ({
  HomeTrustSection: () => <div data-testid='home-trust-section' />,
}));

describe('MarketingHero — landing mode', () => {
  it('uses a generic default section test id', () => {
    render(
      <MarketingHero
        eyebrow='Eyebrow'
        headingId='shared-hero-heading'
        title='Hero title'
        body='Hero body'
        media={<div>Media</div>}
      />
    );

    expect(screen.getByTestId('marketing-hero-section')).toBeInTheDocument();
    expect(screen.queryByTestId('homepage-shell')).not.toBeInTheDocument();
  });

  it('honors the shared test id override in landing mode', () => {
    render(
      <MarketingHero
        eyebrow='Eyebrow'
        headingId='shared-hero-heading'
        title='Hero title'
        body='Hero body'
        media={<div>Media</div>}
        testId='route-hero'
      />
    );

    expect(screen.getByTestId('route-hero')).toHaveAttribute(
      'aria-labelledby',
      'shared-hero-heading'
    );
  });

  it('passes an override CTA analytics event to the CTA button', () => {
    render(
      <MarketingHero
        eyebrow='Eyebrow'
        headingId='shared-hero-heading'
        title='Hero title'
        body='Hero body'
        media={<div>Media</div>}
        ctaEventName='artist_profiles_cta_get_started'
        primaryCtaTestId='shared-hero-primary-cta'
      />
    );

    expect(screen.getByTestId('shared-hero-primary-cta')).toHaveAttribute(
      'data-event-name',
      'artist_profiles_cta_get_started'
    );
  });
});

describe('MarketingHero — shell mode', () => {
  it('renders children inside a variant-constrained section', () => {
    render(
      <MarketingHero
        variant='left'
        headingId='shell-heading'
        testId='shell-hero'
      >
        <h1 id='shell-heading'>Shell heading</h1>
      </MarketingHero>
    );

    expect(screen.getByTestId('shell-hero')).toHaveAttribute(
      'aria-labelledby',
      'shell-heading'
    );
    expect(
      screen.getByRole('heading', { name: 'Shell heading' })
    ).toBeInTheDocument();
  });
});

describe('MarketingHero — content mode', () => {
  it('renders headline, subtitle, CTAs, and the default logo-bar proof', () => {
    render(
      <MarketingHero
        headline='Drop more music, with less work.'
        subtitle='The AI workspace for artists.'
        primaryCta={{ label: 'Claim my workspace', href: '/start' }}
        secondaryCta={{ label: 'See pricing', href: '/pricing' }}
      />
    );

    expect(
      screen.getByRole('heading', {
        name: 'Drop more music, with less work.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Claim my workspace' })
    ).toHaveAttribute('href', '/start');
    expect(screen.getByRole('link', { name: 'See pricing' })).toHaveAttribute(
      'href',
      '/pricing'
    );
    expect(screen.getByTestId('home-trust-section')).toBeInTheDocument();
  });

  it('omits the proof element when logos is false', () => {
    render(
      <MarketingHero
        headline='Headline'
        subtitle='Subtitle'
        primaryCta={{ label: 'Start', href: '/start' }}
        logos={false}
      />
    );

    expect(screen.queryByTestId('home-trust-section')).not.toBeInTheDocument();
  });
});
