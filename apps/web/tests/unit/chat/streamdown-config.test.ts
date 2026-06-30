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
    expect(config.className).toContain('system-b-chat-markdown');
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

  it('allows GFM table elements so comparison tables are not silently stripped', () => {
    const config = getChatMarkdownStreamdownConfig(false);
    const tableElements = [
      'table',
      'thead',
      'tbody',
      'tr',
      'td',
      'th',
    ] as const;
    for (const el of tableElements) {
      expect(config.allowedElements, `Expected ${el} to be allowed`).toContain(
        el
      );
    }
  });

  it('allows img element with safe attributes', () => {
    const config = getChatMarkdownStreamdownConfig(false);
    expect(config.allowedElements).toContain('img');
    expect((config.allowedTags as Record<string, string[]>)['img']).toEqual(
      expect.arrayContaining(['src', 'alt'])
    );
  });

  it('allows h5 and h6 headings', () => {
    const config = getChatMarkdownStreamdownConfig(false);
    expect(config.allowedElements).toContain('h5');
    expect(config.allowedElements).toContain('h6');
  });
});
