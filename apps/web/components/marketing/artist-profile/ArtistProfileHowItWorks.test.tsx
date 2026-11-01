import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { getProductShot } from '@/lib/screenshots/product-shots';
import { ArtistProfileHowItWorks } from './ArtistProfileHowItWorks';

describe('ArtistProfileHowItWorks', () => {
  it('shows each setup step as a registry shot cropped to that moment', () => {
    const { container } = render(
      <ArtistProfileHowItWorks howItWorks={ARTIST_PROFILE_COPY.howItWorks} />
    );

    for (const id of [
      'setup-claim-handle',
      'setup-connect-music',
      'setup-share-profile',
    ] as const) {
      const shot = getProductShot(id);
      expect(
        screen.getByRole('img', { name: shot.alt }).getAttribute('src')
      ).toBe(shot.webp);
    }

    // No full-viewport catalog captures behind CSS crops.
    const sources = [...container.querySelectorAll('img')].map(img =>
      img.getAttribute('src')
    );
    expect(sources.some(src => src?.includes('onboarding-'))).toBe(false);
    expect(container.querySelector('[style*="scale"]')).toBeNull();
  });

  it('keeps the step copy as the only step titles', () => {
    render(
      <ArtistProfileHowItWorks howItWorks={ARTIST_PROFILE_COPY.howItWorks} />
    );
    for (const step of ARTIST_PROFILE_COPY.howItWorks.steps) {
      expect(
        screen.getAllByRole('heading', { level: 3, name: step.title })
      ).toHaveLength(1);
    }
  });
});
