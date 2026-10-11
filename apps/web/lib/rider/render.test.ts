import { describe, expect, it } from 'vitest';
import { renderRiderHtml, renderRiderMarkdown } from './render';

const INPUT = {
  artistName: 'Tim White',
  technical: [
    { title: 'Stage & Sound', items: ['2x monitor wedges', 'DI <laptop>'] },
  ],
  hospitality: [{ title: 'Green Room', items: ['Still "water"'] }],
};

describe('rider renderers', () => {
  it('renders deterministic markdown', () => {
    const md = renderRiderMarkdown(INPUT);
    expect(md).toContain('# Tim White — Rider');
    expect(md).toContain('### Stage & Sound');
    expect(md).toContain('- DI <laptop>');
    expect(renderRiderMarkdown(INPUT)).toBe(md);
    expect(md.endsWith('\n')).toBe(true);
  });

  it('renders deterministic html with all user text escaped', () => {
    const html = renderRiderHtml(INPUT);
    expect(html).toContain('<h3>Stage &amp; Sound</h3>');
    expect(html).toContain('<li>DI &lt;laptop&gt;</li>');
    expect(html).toContain('Still &quot;water&quot;');
    expect(renderRiderHtml(INPUT)).toBe(html);

    const hostile = renderRiderHtml({
      artistName: '<img src=x onerror=alert(1)>',
      technical: [{ title: '"><script>', items: ['a'] }],
      hospitality: [],
    });
    expect(hostile).not.toContain('<img');
    expect(hostile).not.toContain('<script>');
  });
});
