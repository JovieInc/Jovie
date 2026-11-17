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
      readonly items: Record<string, Blob | Promise<Blob>>;
      constructor(items: Record<string, Blob | Promise<Blob>>) {
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
    const plain = await clipboardItem.items['text/plain'];
    const html = await clipboardItem.items['text/html'];
    expect(plain).toBeInstanceOf(Blob);
    expect(html).toBeInstanceOf(Blob);
    expect(plain?.type).toBe('text/plain');
    expect(html?.type).toBe('text/html');
    expect(await html?.text()).toContain('<h2>Heading</h2>');
  });

  it('hands write() the html as a promise so the click keeps clipboard access', async () => {
    let htmlPayload: unknown;
    const write = vi.fn().mockImplementation(async items => {
      htmlPayload = items[0].items['text/html'];
    });
    class MockClipboardItem {
      constructor(readonly items: Record<string, Blob | Promise<Blob>>) {}
    }
    vi.stubGlobal('ClipboardItem', MockClipboardItem);
    vi.stubGlobal('navigator', { clipboard: { write, writeText: vi.fn() } });

    const pending = copyMarkdownToClipboard('Paragraph');
    // write() is called before the markdown renderer has finished loading.
    await Promise.resolve();
    expect(write).toHaveBeenCalledTimes(1);
    expect(htmlPayload).toBeInstanceOf(Promise);
    await expect(pending).resolves.toBe(true);
  });

  it('keeps remark out of the chat bundle until the first copy', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(
      join(__dirname, '../../../lib/chat/copy-markdown.ts'),
      'utf8'
    );
    expect(source).not.toMatch(/^import (?!type)[^;]*from 'remark/m);
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
