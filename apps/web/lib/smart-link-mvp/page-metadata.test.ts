import { describe, expect, it } from 'vitest';
import { linkFailureMessage } from './messages';
import { jovieLinkMetadata } from './page-metadata';

describe('jovie link page metadata', () => {
  it('keeps a script-like title as text and drops a non-https image', () => {
    const title = '<script>alert(1)</script>';
    const metadata = jovieLinkMetadata({
      title,
      artistName: 'Artist',
      artworkUrl: 'javascript:alert(1)',
      pageUrl: 'https://jov.ie/l/abcd2345',
    });
    expect(metadata.title).toBe(`${title} — Artist`);
    expect(metadata.description).toBe(`Listen to ${title} by Artist.`);
    expect(metadata.openGraph?.images).toBeUndefined();
    expect(metadata.alternates?.canonical).toBe('https://jov.ie/l/abcd2345');
  });
});

describe('link failure copy', () => {
  it('stays honest and does not mention a vendor or a price', () => {
    for (const code of [
      'NOT_FOUND',
      'UNSUPPORTED_INPUT',
      'RATE_LIMITED',
      'BUDGET_EXHAUSTED',
      'UPSTREAM_FAILURE',
      'LIMIT_REACHED',
    ]) {
      const message = linkFailureMessage(code);
      expect(message).toBeTruthy();
      expect(message).not.toMatch(/musicfetch|\$|upgrade|checkout|pricing/i);
    }
  });
});
