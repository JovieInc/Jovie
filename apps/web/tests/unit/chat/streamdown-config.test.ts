import { describe, expect, it } from 'vitest';

import { getChatMarkdownStreamdownConfig } from '@/lib/markdown/streamdown-config';

describe('getChatMarkdownStreamdownConfig', () => {
  it('enables streaming mode and caret while streaming', () => {
    const config = getChatMarkdownStreamdownConfig(true, 'custom-class');

    expect(config.mode).toBe('streaming');
    expect(config.isAnimating).toBe(true);
    expect(config.caret).toBe('block');
    expect(config.className).toContain('text-sm');
    expect(config.className).toContain('custom-class');
  });

  it('blocks unsafe protocols from links', () => {
    const config = getChatMarkdownStreamdownConfig(false);

    expect(config.mode).toBe('static');
    expect(
      config.urlTransform?.('javascript:alert(1)', 'href', {} as never)
    ).toBe('');
    expect(config.urlTransform?.('https://jovie.fm', 'href', {} as never)).toBe(
      'https://jovie.fm'
    );
  });
});
