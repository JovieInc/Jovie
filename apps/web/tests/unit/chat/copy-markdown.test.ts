import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  copyMarkdownToClipboard,
  markdownToHtml,
} from '@/lib/chat/copy-markdown';

describe('copy-markdown', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders markdown to sanitized html', async () => {
    const html = await markdownToHtml('**Bold** and `code`');
    expect(html).toContain('<strong>Bold</strong>');
    expect(html).toContain('<code>code</code>');
    expect(html).not.toContain('<script');
  });

  it('writes markdown and html clipboard payloads when supported', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    class MockClipboardItem {
      readonly items: Record<string, Blob>;
      constructor(items: Record<string, Blob>) {
        this.items = items;
      }
    }

    vi.stubGlobal('ClipboardItem', MockClipboardItem);
    vi.stubGlobal('navigator', {
      clipboard: { write, writeText: vi.fn() },
    });

    const success = await copyMarkdownToClipboard('## Heading\n\nParagraph');

    expect(success).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    const clipboardItem = write.mock.calls[0]?.[0]?.[0] as MockClipboardItem;
    expect(clipboardItem.items['text/plain']).toBeInstanceOf(Blob);
    expect(clipboardItem.items['text/html']).toBeInstanceOf(Blob);
    expect(clipboardItem.items['text/plain'].type).toBe('text/plain');
    expect(clipboardItem.items['text/html'].type).toBe('text/html');
  });

  it('falls back to plain text copy when rich clipboard write is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      clipboard: { writeText },
    });
    vi.stubGlobal('ClipboardItem', undefined);

    const success = await copyMarkdownToClipboard('Keep **markdown**');

    expect(success).toBe(true);
    expect(writeText).toHaveBeenCalledWith('Keep **markdown**');
  });
});
