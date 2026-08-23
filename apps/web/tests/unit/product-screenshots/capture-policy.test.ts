import { describe, expect, it } from 'vitest';
import { getAnimationFrozenScreenshotOptions } from '../../../tests/product-screenshots/capture-policy';

describe('product screenshot capture policy', () => {
  it('freezes CSS animations for both page and locator capture paths', () => {
    expect(getAnimationFrozenScreenshotOptions('/tmp/capture.png')).toEqual({
      animations: 'disabled',
      path: '/tmp/capture.png',
      type: 'png',
    });
  });
});
