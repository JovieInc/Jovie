import { describe, expect, it } from 'vitest';
import { sanitizeServerHtml } from './sanitize';

describe('sanitizeServerHtml', () => {
  it('drops hrefs that decode to javascript or data urls', () => {
    const decimal = sanitizeServerHtml(
      '<a href="&#106;avascript:alert(1)">listen</a>'
    );
    const hex = sanitizeServerHtml(
      '<a href="&#x6A;avascript:alert(1)">listen</a>'
    );
    const data = sanitizeServerHtml(
      '<a href="&#100;ata:text/html,hi">listen</a>'
    );

    expect(decimal).not.toContain('href');
    expect(decimal).toContain('listen');
    expect(hex).not.toContain('href');
    expect(data).not.toContain('href');
  });

  it('keeps an https href after decoding a numeric character', () => {
    const html = sanitizeServerHtml(
      '<a href="https://jovie.test/&#106;oy">listen</a>'
    );

    expect(html).toContain('href="https://jovie.test/&#106;oy"');
    expect(html).toContain('listen');
  });
});
