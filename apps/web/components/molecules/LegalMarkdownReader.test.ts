import { describe, expect, it } from 'vitest';
import { focusLegalScrollRegions } from './LegalMarkdownReader';

describe('focusLegalScrollRegions', () => {
  it('makes overflowing legal tables and code blocks keyboard reachable', () => {
    const html = focusLegalScrollRegions(
      '<table><tr><td>Wide</td></tr></table><pre><code>line</code></pre>'
    );

    expect(html).toContain('<table tabindex="0">');
    expect(html).toContain('<pre tabindex="0">');
  });

  it('focuses every region on a second call', () => {
    const source = '<table></table><pre></pre>';
    expect(focusLegalScrollRegions(source)).toBe(
      focusLegalScrollRegions(source)
    );
  });

  it('keeps an author-supplied tabindex', () => {
    expect(
      focusLegalScrollRegions('<table class="wide" tabindex="-1"></table>')
    ).toBe('<table class="wide" tabindex="-1"></table>');
  });
});
