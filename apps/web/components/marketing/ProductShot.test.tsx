import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  getProductShot,
  PRODUCT_SHOT_DPR,
  PRODUCT_SHOTS,
} from '@/lib/screenshots/product-shots';
import { ProductShot } from './ProductShot';

describe('ProductShot', () => {
  it('serves AVIF first with a WebP fallback at explicit CSS dimensions', () => {
    const { container } = render(<ProductShot id='setup-claim-handle' />);
    const shot = getProductShot('setup-claim-handle');
    const img = screen.getByRole('img', { name: shot.alt });

    expect(container.querySelector('source')).toHaveAttribute(
      'type',
      'image/avif'
    );
    expect(container.querySelector('source')).toHaveAttribute(
      'srcset',
      shot.avif
    );
    expect(img).toHaveAttribute('src', shot.webp);
    expect(img).toHaveAttribute('width', String(shot.width));
    expect(img).toHaveAttribute('height', String(shot.height));
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('loads eagerly with high priority when it is the first visual', () => {
    render(<ProductShot id='profile-hero-desktop' priority />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('loading', 'eager');
    expect(img).toHaveAttribute('fetchpriority', 'high');
  });

  it('cache-busts on the source hash so a re-render reaches visitors', () => {
    for (const spec of PRODUCT_SHOTS) {
      const shot = getProductShot(spec.id);
      expect(shot.avif).toMatch(
        new RegExp(`^/product-shots/${spec.id}\\.avif\\?v=[0-9a-f]{12}$`)
      );
      // Intrinsic pixels are 2x; the component advertises CSS pixels.
      expect(shot.width).toBeLessThanOrEqual(spec.displayWidth);
      expect(PRODUCT_SHOT_DPR).toBe(2);
    }
  });

  it('draws window chrome only for window-framed shots', () => {
    const { container } = render(<ProductShot id='setup-connect-music' />);
    expect(container.querySelector('.product-shot__bar')).toBeNull();
  });
});
