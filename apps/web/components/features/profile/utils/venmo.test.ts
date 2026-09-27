import { describe, expect, it } from 'vitest';
import { buildVenmoPaymentUrl } from './venmo';

describe('buildVenmoPaymentUrl', () => {
  it('adds the amount and username to a canonical Venmo link', () => {
    expect(buildVenmoPaymentUrl('https://venmo.com/u/tim', 10)).toBe(
      'https://venmo.com/u/tim?utm_amount=10&utm_username=tim'
    );
  });

  it('appends to an existing query string', () => {
    expect(buildVenmoPaymentUrl('https://venmo.com/tim?txn=pay', 5)).toBe(
      'https://venmo.com/tim?txn=pay&utm_amount=5&utm_username=tim'
    );
  });

  it('rejects missing, non-HTTPS, and non-Venmo links', () => {
    expect(buildVenmoPaymentUrl(null, 10)).toBeNull();
    expect(buildVenmoPaymentUrl('http://venmo.com/u/tim', 10)).toBeNull();
    expect(buildVenmoPaymentUrl('https://evil.test/u/tim', 10)).toBeNull();
  });
});
