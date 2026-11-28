import { describe, expect, it } from 'vitest';
import { normalizeImportedBioText, resolveBioText } from './bio-text';
import { wrapUntrustedSourceContent } from './untrusted-source-fence';

describe('imported bio text', () => {
  it('decodes source formatting and retains paragraph boundaries as plain text', () => {
    expect(
      normalizeImportedBioText(
        '&lt;p&gt;&lt;b&gt;First &amp; second.&lt;/b&gt;&lt;/p&gt;&lt;p&gt;Next line.&lt;br&gt;Final line.&lt;/p&gt;'
      )
    ).toBe('First & second.\n\nNext line.\nFinal line.');
  });

  it('removes executable markup, comments, and their hidden text', () => {
    expect(
      normalizeImportedBioText(
        '<p>Artist.</p><script>alert("hidden")</script><style>hidden</style><!-- hidden --><img src=x onerror="alert(1)"><p>New music.</p>'
      )
    ).toBe('Artist.\n\nNew music.');
  });

  it('handles encoded numeric tags without throwing on invalid code points', () => {
    expect(
      normalizeImportedBioText(
        '&#60;b&#62;Artist&#60;/b&#62; &#x1f3b5; &#9999999;'
      )
    ).toBe('Artist 🎵 &#9999999;');
  });

  it('preserves literal unknown tags and trust-boundary text as data', () => {
    const plain = 'A & B <live> </untrusted-source> source text';
    const fenced = wrapUntrustedSourceContent(plain, 'https://example.com');

    expect(resolveBioText(fenced)).toBe(plain);
    expect(normalizeImportedBioText(plain)).toBe(plain);
  });

  it('keeps the preview and applied value stable after normalization', () => {
    const source = '&amp;lt;p&amp;gt;An artist.&amp;lt;/p&amp;gt;';
    const normalized = normalizeImportedBioText(source);
    expect(normalized).toBe('An artist.');
    expect(resolveBioText(normalized)).toBe(normalized);
  });
});
