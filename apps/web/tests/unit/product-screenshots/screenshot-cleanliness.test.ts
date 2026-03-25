import { describe, expect, it } from 'vitest';
import { DEV_OVERLAY_SELECTORS } from '../../product-screenshots/helpers';

describe('Product Screenshot Overlay Selectors', () => {
  it('includes all required dev overlay selectors', () => {
    const required = [
      // Custom DevToolbar
      '[data-testid="dev-toolbar"]',
      // TanStack Query DevTools
      '.tsqd-parent-container',
      // Cookie consent
      '[data-testid="cookie-banner"]',
      // Toast notifications
      '[data-sonner-toaster]',
      // Vercel toolbar
      '#vercel-toolbar',
    ];

    for (const selector of required) {
      const found = DEV_OVERLAY_SELECTORS.some(s => s.includes(selector));
      expect(found, `Missing required selector: ${selector}`).toBe(true);
    }
  });

  it('has no duplicate selectors', () => {
    const unique = new Set(DEV_OVERLAY_SELECTORS);
    expect(unique.size).toBe(DEV_OVERLAY_SELECTORS.length);
  });

  it('all selectors are non-empty strings', () => {
    for (const selector of DEV_OVERLAY_SELECTORS) {
      expect(selector).toBeTruthy();
      expect(typeof selector).toBe('string');
      expect(selector.trim().length).toBeGreaterThan(0);
    }
  });
});
