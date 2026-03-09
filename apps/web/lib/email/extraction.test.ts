import { describe, expect, it } from 'vitest';

import { extractEmailsFromHtml } from '@/lib/email/extraction';

describe('extractEmailsFromHtml', () => {
  it('extracts visible emails and excludes script/style content', () => {
    const html = `
      <script>window.__email__ = "hidden@example.com";</script>
      <style>.banner::before { content: "style@example.com"; }</style>
      <p>Contact us at visible@example.com</p>
    `;

    expect(extractEmailsFromHtml(html)).toEqual(['visible@example.com']);
  });

  it('extracts email addresses from mailto links', () => {
    const html =
      '<a href="mailto:artist%2Bbookings@example.com?subject=Booking">Email</a>';

    expect(extractEmailsFromHtml(html)).toEqual([
      'artist+bookings@example.com',
    ]);
  });
});
