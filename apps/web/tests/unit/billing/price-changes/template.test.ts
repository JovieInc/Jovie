import { describe, expect, it } from 'vitest';
import {
  getPriceChangeNoticeHtml,
  getPriceChangeNoticeSubject,
  getPriceChangeNoticeText,
  hashNoticeContent,
} from '@/lib/email/templates/price-change-notice';

const DATA = {
  userName: 'Sam <b>',
  planName: 'Artist Presence',
  oldAmountCents: 1200,
  newAmountCents: 1500,
  currency: 'usd',
  effectiveDate: '2027-01-15',
  manageUrl: 'https://jov.ie/app/settings/billing',
};

describe('price change notice template', () => {
  it('states the plan, old and new price, effective date and how to cancel', () => {
    const text = getPriceChangeNoticeText(DATA);
    expect(text).toContain('Artist Presence');
    expect(text).toContain('$12');
    expect(text).toContain('$15');
    expect(text).toContain('January 15, 2027');
    expect(text).toMatch(/cancel/i);
    expect(text).toContain(DATA.manageUrl);
    expect(getPriceChangeNoticeSubject(DATA)).toContain('January 15, 2027');
  });

  it('escapes the recipient name in HTML and hashes the content deterministically', () => {
    expect(getPriceChangeNoticeHtml(DATA)).not.toContain('Sam <b>');
    expect(hashNoticeContent('s', 't')).toBe(hashNoticeContent('s', 't'));
    expect(hashNoticeContent('s', 't')).not.toBe(hashNoticeContent('s', 'u'));
  });
});
