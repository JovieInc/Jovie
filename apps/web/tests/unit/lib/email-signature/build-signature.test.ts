import { describe, expect, it } from 'vitest';

import { buildEmailSignature } from '@/lib/email-signature/build-signature';

describe('buildEmailSignature', () => {
  it('renders name, handle link, and default Jovie footer', () => {
    const { html, text } = buildEmailSignature({
      name: 'Deadmau5',
      handle: 'deadmau5',
    });

    expect(html).toContain('Deadmau5');
    expect(html).toContain('jov.ie/deadmau5');
    expect(html).toContain('Get yours at');
    expect(text).toContain('Deadmau5');
    expect(text).toContain('jov.ie/deadmau5');
    expect(text).toContain('Get yours at');
  });

  it('HTML-escapes interpolated values', () => {
    const { html } = buildEmailSignature({
      name: '<script>alert(1)</script>',
      handle: 'safe',
      tagline: `Quote"ed & 'test'`,
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;');
    expect(html).toContain('&#39;');
  });

  it('drops http:// and data: avatar URLs but keeps https://', () => {
    const insecure = buildEmailSignature({
      name: 'A',
      handle: 'a',
      avatarUrl: 'http://example.com/a.png',
    });
    expect(insecure.html).not.toContain('example.com');

    const dataUri = buildEmailSignature({
      name: 'A',
      handle: 'a',
      avatarUrl: 'data:image/png;base64,AAAA',
    });
    expect(dataUri.html).not.toContain('data:image/png');

    const secure = buildEmailSignature({
      name: 'A',
      handle: 'a',
      avatarUrl: 'https://cdn.example.com/a.png',
    });
    expect(secure.html).toContain('https://cdn.example.com/a.png');
  });

  it('filters out socials with non-https URLs', () => {
    const { html } = buildEmailSignature({
      name: 'A',
      handle: 'a',
      socials: [
        { label: 'Good', url: 'https://good.example/x' },
        { label: 'Bad', url: 'http://bad.example/x' },
        { label: 'NoLabel', url: '' },
      ],
    });
    expect(html).toContain('Good');
    expect(html).not.toContain('Bad');
    expect(html).not.toContain('NoLabel');
  });

  it('omits the Jovie footer when hideJovieBranding=true', () => {
    const { html, text } = buildEmailSignature({
      name: 'A',
      handle: 'a',
      hideJovieBranding: true,
    });
    expect(html).not.toContain('Get yours at');
    expect(text).not.toContain('Get yours at');
  });

  it('includes UTM params on the footer link', () => {
    const { html } = buildEmailSignature({ name: 'A', handle: 'a' });
    expect(html).toContain('utm_source=email_signature');
    expect(html).toContain('utm_medium=footer');
  });
});
