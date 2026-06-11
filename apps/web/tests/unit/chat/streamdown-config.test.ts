import { describe, expect, it } from 'vitest';

import {
  CHAT_MARKDOWN_STATIC_CONFIG,
  CHAT_MARKDOWN_STREAMING_CONFIG,
  getChatMarkdownStreamdownConfig,
} from '@/lib/markdown/streamdown-config';

describe('getChatMarkdownStreamdownConfig', () => {
  it('enables streaming mode and caret while streaming', () => {
    const config = getChatMarkdownStreamdownConfig(true, 'custom-class');

    expect(config.mode).toBe('streaming');
    expect(config.isAnimating).toBe(true);
    expect(config.caret).toBe('block');
    expect(config.className).toContain('text-[15px]');
    expect(config.className).toContain('custom-class');
  });

  it('reuses frozen streamdown configs on the hot path', () => {
    expect(getChatMarkdownStreamdownConfig(true)).toBe(
      CHAT_MARKDOWN_STREAMING_CONFIG
    );
    expect(getChatMarkdownStreamdownConfig(false)).toBe(
      CHAT_MARKDOWN_STATIC_CONFIG
    );
  });

  it('blocks unsafe protocols from links', () => {
    const config = getChatMarkdownStreamdownConfig(false);

    expect(config.mode).toBe('static');
    expect(
      config.urlTransform?.('javascript:alert(1)', 'href', {} as never)
    ).toBe('');
    expect(config.urlTransform?.('https://jov.ie', 'href', {} as never)).toBe(
      'https://jov.ie'
    );
  });
});
