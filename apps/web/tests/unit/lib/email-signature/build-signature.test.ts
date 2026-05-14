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
    expect(html).toContain('Get your free music link in bio');
    expect(text).toContain('Deadmau5');
    expect(text).toContain('jov.ie/deadmau5');
    expect(text).toContain('Get your free music link in bio');
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
    expect(html).not.toContain('Get your free music link in bio');
    expect(text).not.toContain('Get your free music link in bio');
  });

  it('includes branding UTM params on the footer link', () => {
    const { html } = buildEmailSignature({ name: 'A', handle: 'a' });
    expect(html).toContain('utm_source=email_signature');
    expect(html).toContain('utm_medium=referral');
    expect(html).toContain('utm_campaign=branding');
  });

  it('renders a latest release row when https URL is provided', () => {
    const { html, text } = buildEmailSignature({
      name: 'A',
      handle: 'a',
      latestRelease: {
        title: 'New Single',
        url: 'https://open.spotify.com/track/abc',
        artworkUrl: 'https://cdn.example.com/art.png',
      },
    });
    expect(html).toContain('Latest release');
    expect(html).toContain('New Single');
    expect(html).toContain('Stream now');
    expect(html).toContain('https://cdn.example.com/art.png');
    expect(text).toContain('New Single');
    expect(text).toContain('https://open.spotify.com/track/abc');
  });

  it('drops a release with an insecure URL', () => {
    const { html } = buildEmailSignature({
      name: 'A',
      handle: 'a',
      latestRelease: {
        title: 'Insecure Single',
        url: 'http://bad.example/track',
      },
    });
    expect(html).not.toContain('Insecure Single');
    expect(html).not.toContain('Latest release');
  });

  it('renders release without artwork when artworkUrl is missing or insecure', () => {
    const { html } = buildEmailSignature({
      name: 'A',
      handle: 'a',
      latestRelease: {
        title: 'Bare Single',
        url: 'https://open.spotify.com/track/xyz',
        artworkUrl: 'http://bad.example/art.png',
      },
    });
    expect(html).toContain('Bare Single');
    expect(html).not.toContain('http://bad.example/art.png');
  });

  it('produces table-only HTML with no flexbox/grid/style blocks', () => {
    const { html } = buildEmailSignature({
      name: 'A',
      handle: 'a',
      avatarUrl: 'https://cdn.example.com/a.png',
      socials: [{ label: 'IG', url: 'https://instagram.com/a' }],
    });
    expect(html).toContain('<table');
    expect(html).not.toContain('<style');
    expect(html).not.toMatch(/display\s*:\s*(flex|grid)/);
    expect(html).not.toContain('--');
  });
});
