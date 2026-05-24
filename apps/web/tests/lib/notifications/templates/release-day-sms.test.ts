import { describe, expect, it } from 'vitest';
import { buildReleaseDaySmsBody } from '@/lib/notifications/templates/release-day-sms';

describe('buildReleaseDaySmsBody', () => {
  it('formats a standard release into a single-segment-friendly body', () => {
    const body = buildReleaseDaySmsBody({
      artistName: 'Tim White',
      releaseTitle: 'Blessings',
      username: 'tim',
      slug: 'blessings',
    });

    expect(body).toBe(
      'New from Tim White: "Blessings" - https://jov.ie/tim/blessings'
    );
  });

  it('respects baseUrl override and strips trailing slash', () => {
    const body = buildReleaseDaySmsBody({
      artistName: 'A',
      releaseTitle: 'T',
      username: 'u',
      slug: 's',
      baseUrl: 'https://staging.jov.ie/',
    });

    expect(body).toContain('https://staging.jov.ie/u/s');
  });

  it('encodes special characters in username and slug', () => {
    const body = buildReleaseDaySmsBody({
      artistName: 'Artist',
      releaseTitle: 'Track',
      username: 'foo bar',
      slug: 'b/c',
    });

    expect(body).toContain('https://jov.ie/foo%20bar/b%2Fc');
  });

  it('contains no emoji or astral codepoints (keeps GSM-7 encoding)', () => {
    const body = buildReleaseDaySmsBody({
      artistName: 'A',
      releaseTitle: 'T',
      username: 'u',
      slug: 's',
    });

    // Astral plane (U+10000+) is encoded as surrogate pairs in JS strings.
    // Their absence is a strong proxy for "no emoji / no UCS-2 fallback".
    const hasAstral = /[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(body);
    expect(hasAstral).toBe(false);
  });

  it('truncates an outrageously long title rather than the URL', () => {
    const longTitle = 'X'.repeat(2000);
    const body = buildReleaseDaySmsBody({
      artistName: 'Tim',
      releaseTitle: longTitle,
      username: 'tim',
      slug: 'huge',
    });

    expect(body.length).toBeLessThanOrEqual(320);
    expect(body).toContain('https://jov.ie/tim/huge');
    expect(body).toContain('...');
  });

  it('returns a sane fallback when artist + URL alone exceed the cap', () => {
    const longArtist = 'A'.repeat(2000);
    const body = buildReleaseDaySmsBody({
      artistName: longArtist,
      releaseTitle: 'Title',
      username: 'u',
      slug: 's',
    });

    expect(body.length).toBeLessThanOrEqual(320);
    expect(body).toContain('https://jov.ie/u/s');
  });
});
