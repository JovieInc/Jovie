import { render, screen } from '@testing-library/react';
import type { ImgHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileCaptureSection } from './ArtistProfileCaptureSection';
import { ArtistProfileFaq } from './ArtistProfileFaq';
import { ArtistProfileFinalCta } from './ArtistProfileFinalCta';
import { ArtistProfileHeroAdaptiveIntro } from './ArtistProfileHeroAdaptiveIntro';

// next/image with `priority` makes React DOM preload the image by querying
// `link[imagesrcset="..."]`; the hero's srcset makes that selector longer
// than the 2048-character limit jsdom 30's selector engine enforces, which
// throws an unhandled RangeError. Image preloading is not what this
// composition test covers (Radix Slot boundaries are), so render a plain img.
vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    priority: _priority,
    quality: _quality,
    placeholder: _placeholder,
    blurDataURL: _blurDataURL,
    unoptimized: _unoptimized,
    loader: _loader,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & Record<string, unknown>) => (
    <img {...props} alt={typeof props.alt === 'string' ? props.alt : ''} />
  ),
}));

describe('Artist profile section delegation', () => {
  it('keeps the hero and adaptive product split as distinct semantic roots, with no unpermissioned logo strip', () => {
    render(
      <ArtistProfileHeroAdaptiveIntro
        hero={ARTIST_PROFILE_COPY.hero}
        adaptive={ARTIST_PROFILE_COPY.adaptive}
        logoPlacement={{ page: '/artist-profiles' }}
      />
    );
    const hero = screen.getByTestId('marketing-section-hero');
    const adaptive = screen.getByTestId('marketing-section-feature-split');
    expect(hero.tagName).toBe('SECTION');
    expect(adaptive.tagName).toBe('SECTION');
    expect(hero.contains(adaptive)).toBe(false);
    expect(adaptive).toHaveAttribute('data-marketing-occurrence', 'adaptive');
    // No brand has granted permission for this page (JOV-7795).
    expect(screen.queryByTestId('marketing-section-logo-cloud')).toBeNull();
  });
  it('visibly identifies sample fan opt-ins without pretending to send a message', () => {
    render(
      <ArtistProfileCaptureSection capture={ARTIST_PROFILE_COPY.capture} />
    );
    expect(
      screen.getByText('Illustrative opt-in · no message is sent')
    ).toBeVisible();
    expect(
      screen.getByTestId('artist-profile-capture-demo').querySelector('input')
    ).toBeNull();
    expect(
      screen.getByTestId('artist-profile-capture-demo').querySelector('button')
    ).toBeNull();
  });

  it('preserves FAQ button behavior under its declared semantic owner', () => {
    render(<ArtistProfileFaq faq={ARTIST_PROFILE_COPY.faq} />);
    const root = screen.getByTestId('marketing-section-faq');
    expect(root.tagName).toBe('SECTION');
    expect(root).toHaveAttribute('data-marketing-variant', 'objection-handler');
    expect(root).toHaveAttribute(
      'data-marketing-owner',
      'apps/web/components/marketing/FaqSection.tsx'
    );
    expect(screen.getAllByRole('button')).toHaveLength(
      ARTIST_PROFILE_COPY.faq.items.length
    );
  });
  it('passes the final claim intent to the canonical CTA root and preserves its action', () => {
    render(<ArtistProfileFinalCta finalCta={ARTIST_PROFILE_COPY.finalCta} />);
    const root = screen.getByTestId('marketing-section-cta');
    expect(root.tagName).toBe('SECTION');
    expect(root).toHaveAttribute(
      'data-marketing-variant',
      'final-single-claim'
    );
    expect(root).toHaveAttribute(
      'data-marketing-owner',
      'apps/web/components/site/MarketingTerminalCta.tsx'
    );
    expect(screen.getByTestId('final-cta-action')).toHaveAttribute(
      'href',
      '/start'
    );
  });
});
