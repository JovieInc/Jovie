import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SharedMarketingHero } from '@/features/landing/SharedMarketingHero';

vi.mock('@/features/landing/LandingCTAButton', () => ({
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

describe('SharedMarketingHero', () => {
  it('uses a generic default section test id', () => {
    render(
      <SharedMarketingHero
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

  it('passes an override CTA analytics event to the CTA button', () => {
    render(
      <SharedMarketingHero
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
