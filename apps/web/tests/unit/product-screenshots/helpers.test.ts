import type { Page } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import { waitForImages } from '../../product-screenshots/helpers';

describe('product screenshot helpers', () => {
  it('treats an image-free container as settled', async () => {
    const waitForFunction = vi.fn(
      async (predicate: (selector: string) => boolean, selector: string) => {
        document.body.replaceChildren();
        expect(predicate(selector)).toBe(true);
      }
    );

    await waitForImages({ waitForFunction } as unknown as Page);

    expect(waitForFunction).toHaveBeenCalledOnce();
  });
});
