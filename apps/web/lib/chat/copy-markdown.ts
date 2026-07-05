import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkHtml from 'remark-html';
import { sanitizeServerHtml } from '@/lib/html/sanitize';

let markdownProcessor: ReturnType<typeof remark> | null = null;

function getMarkdownProcessor(): ReturnType<typeof remark> {
  if (!markdownProcessor) {
    markdownProcessor = remark()
      .use(remarkGfm)
      .use(remarkHtml, { sanitize: false });
  }
  return markdownProcessor;
}

/** Render markdown to sanitized HTML for rich clipboard payloads. */
export async function markdownToHtml(markdown: string): Promise<string> {
  const result = await getMarkdownProcessor().process(markdown);
  return sanitizeServerHtml(String(result));
}

function fallbackCopyPlainText(text: string): boolean {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-999999px';
    textarea.style.top = '-999999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const successful = document.execCommand('copy');
    textarea.remove();
    return successful;
  } catch {
    return false;
  }
}

/**
 * Copy assistant markdown to the clipboard with both plain-text markdown and
 * rendered HTML so rich paste targets keep formatting.
 */
export async function copyMarkdownToClipboard(
  markdown: string
): Promise<boolean> {
  if (!markdown) return false;

  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard?.write &&
      typeof ClipboardItem !== 'undefined'
    ) {
      const html = await markdownToHtml(markdown);
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([markdown], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        }),
      ]);
      return true;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(markdown);
      return true;
    }
  } catch {
    // Fall through to legacy copy.
  }

  return fallbackCopyPlainText(markdown);
}
