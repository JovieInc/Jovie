import { describe, expect, it } from 'vitest';
import { buildVenmoPaymentUrl } from './venmo';

describe('buildVenmoPaymentUrl', () => {
  it('adds the amount and username to a canonical Venmo link', () => {
    expect(buildVenmoPaymentUrl('https://venmo.com/u/tim', 10)).toBe(
      'https://venmo.com/u/tim?txn=pay&amount=10'
    );
  });

  it('appends to an existing query string', () => {
    expect(buildVenmoPaymentUrl('https://venmo.com/tim?txn=pay', 5)).toBe(
      'https://venmo.com/tim?txn=pay&amount=5'
    );
  });

  it('rejects missing, non-HTTPS, and non-Venmo links', () => {
    expect(buildVenmoPaymentUrl(null, 10)).toBeNull();
    expect(buildVenmoPaymentUrl('http://venmo.com/u/tim', 10)).toBeNull();
    expect(buildVenmoPaymentUrl('https://evil.test/u/tim', 10)).toBeNull();
  });
});

describe('buildVenmoPaymentUrl amount hand-off', () => {
  it('pre-fills the chosen amount so the payer does not retype it', () => {
    const url = new URL(
      buildVenmoPaymentUrl('https://venmo.com/u/tim', 12.5) as string
    );
    expect(url.searchParams.get('txn')).toBe('pay');
    expect(url.searchParams.get('amount')).toBe('12.5');
  });

  it('rejects a non-positive amount', () => {
    expect(buildVenmoPaymentUrl('https://venmo.com/u/tim', 0)).toBeNull();
  });
});
