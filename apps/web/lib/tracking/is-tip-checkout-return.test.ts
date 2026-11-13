import { describe, expect, it } from 'vitest';
import { isTipCheckoutReturn } from './is-tip-checkout-return';

describe('tip checkout analytics exclusion', () => {
  it.each(['/artist/tip/thank-you', '/artist/tip/thank-you/'])(
    'protects %s',
    pathname => expect(isTipCheckoutReturn(pathname)).toBe(true)
  );
  it.each([null, '/', '/artist', '/artist/tip', '/artist/tip/thank-you-more'])(
    'preserves ordinary attribution on %s',
    pathname => expect(isTipCheckoutReturn(pathname)).toBe(false)
  );
});
