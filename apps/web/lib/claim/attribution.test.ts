import { describe, expect, it } from 'vitest';
import { claimHrefWithAttribution } from './attribution';

describe('claim attribution allowlist', () => {
  it('keeps the trusted destination and route parameters, carrying only safe UTM labels', () => {
    const href = claimHrefWithAttribution(
      '/artist/claim?next=auth',
      new URLSearchParams(
        'utm_source=claim_link&utm_medium=dm&utm_campaign=claim-link-outreach&utm_term=artist&utm_content=variant-1&next=evil&token=secret&redirect_url=https://evil.example&email=user@example.com'
      )
    );
    expect(href).toBe(
      '/artist/claim?next=auth&utm_source=claim_link&utm_medium=dm&utm_campaign=claim-link-outreach&utm_term=artist&utm_content=variant-1'
    );
  });
  it.each([
    'person@example.com',
    'https://evil.example',
    'bad\nvalue',
    '%40person',
    'a'.repeat(129),
    '',
  ])('drops unsafe attribution %s', value => {
    const source = new URLSearchParams({ utm_content: value });
    expect(claimHrefWithAttribution('/artist/claim?next=auth', source)).toBe(
      '/artist/claim?next=auth'
    );
  });
  it('drops duplicate keys without overriding trusted query parameters', () => {
    expect(
      claimHrefWithAttribution(
        '/artist',
        new URLSearchParams('utm_source=first&utm_source=second')
      )
    ).toBe('/artist');
  });
});
