import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  getProductShot,
  PRODUCT_SHOT_DPR,
  PRODUCT_SHOTS,
} from '@/lib/screenshots/product-shots';
import { PRODUCT_SHOT_MOBILE_MEDIA, ProductShot } from './ProductShot';

describe('ProductShot', () => {
  it('serves AVIF first with a WebP fallback at explicit CSS dimensions', () => {
    const { container } = render(<ProductShot id='setup-claim-handle' />);
    const shot = getProductShot('setup-claim-handle');
    const img = screen.getByRole('img', { name: shot.alt });

    const desktop = container.querySelector('source:not([media])');
    expect(desktop).toHaveAttribute('type', 'image/avif');
    expect(desktop).toHaveAttribute('srcset', shot.avif);
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

  it('serves a mobile variant below the narrow breakpoint without CLS', async () => {
    const registry = await import('@/lib/screenshots/product-shots');
    const base = registry.getProductShot('setup-connect-music');
    const mobile = {
      avif: '/product-shots/setup-connect-music--mobile.avif?v=1',
      webp: '/product-shots/setup-connect-music--mobile.webp?v=1',
      width: 358,
      height: 180,
    };
    const spy = vi
      .spyOn(registry, 'getProductShot')
      .mockReturnValue({ ...base, mobile });
    const { container } = render(<ProductShot id='setup-connect-music' />);
    const [mobileAvif, mobileWebp, desktopAvif] =
      container.querySelectorAll('source');

    expect(mobileAvif).toHaveAttribute('media', PRODUCT_SHOT_MOBILE_MEDIA);
    expect(mobileAvif).toHaveAttribute('srcset', mobile.avif);
    expect(mobileWebp).toHaveAttribute('srcset', mobile.webp);
    expect(desktopAvif).not.toHaveAttribute('media');
    // Dimensions on the mobile sources reserve the swap's aspect (no CLS),
    // with no inline style on the figure (System B source invariant).
    expect(mobileAvif).toHaveAttribute('width', '358');
    expect(mobileAvif).toHaveAttribute('height', '180');
    expect(container.querySelector('figure')).not.toHaveAttribute('style');
    spy.mockRestore();
  });

  it('draws window chrome only for window-framed shots', () => {
    const { container } = render(<ProductShot id='setup-connect-music' />);
    expect(container.querySelector('.product-shot__bar')).toBeNull();
  });
});
