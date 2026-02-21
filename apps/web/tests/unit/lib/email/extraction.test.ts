import { describe, expect, it } from 'vitest';
import { extractEmailsFromHtml } from '@/lib/email/extraction';

describe('email extraction from html', () => {
  it('extracts visible text emails and ignores script/style content', () => {
    const html = `
      <div>
        reach us at booking@example.com
        <style>
          .foo { content: 'style@should-not-match.com'; }
        </style>
        <script>
          const leaked = "script@should-not-match.com";
        </script>
      </div>
    `;

    expect(extractEmailsFromHtml(html)).toEqual(['booking@example.com']);
  });

  it('extracts mailto links without relying on regex html tag stripping', () => {
    const html = '<a href="mailto:manager%40example.com?subject=Hi">Email</a>';

    expect(extractEmailsFromHtml(html)).toEqual(['manager@example.com']);
  });

  it('handles malformed script blocks safely', () => {
    const html =
      '<script>const bad = "hidden@example.com"</script broken><p>visible@example.com</p>';

    expect(extractEmailsFromHtml(html)).toEqual(['visible@example.com']);
  });
});
