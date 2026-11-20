import type { remark as Remark } from 'remark';
import { sanitizeServerHtml } from '@/lib/html/sanitize';

type MarkdownProcessor = ReturnType<typeof Remark>;

let markdownProcessor: Promise<MarkdownProcessor> | null = null;

/*
 * remark, remark-gfm and remark-html load on the first copy,
 * not with the chat: they are about 120 KB of the chat entry bundle and only
 * the copy action needs them.
 */
function getMarkdownProcessor(): Promise<MarkdownProcessor> {
  markdownProcessor ??= Promise.all([
    import('remark'),
    import('remark-gfm'),
    import('remark-html'),
  ]).then(([{ remark }, { default: remarkGfm }, { default: remarkHtml }]) =>
    remark().use(remarkGfm).use(remarkHtml, { sanitize: false })
  );
  markdownProcessor.catch(() => {
    markdownProcessor = null;
  });
  return markdownProcessor;
}

/** Render markdown to sanitized HTML for rich clipboard payloads. */
export async function markdownToHtml(markdown: string): Promise<string> {
  const processor = await getMarkdownProcessor();
  const result = await processor.process(markdown);
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
      // The HTML goes in as a promise so write() runs inside the click:
      // the renderer loads on first copy, and Safari drops clipboard access
      // once a click handler awaits.
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([markdown], { type: 'text/plain' }),
          'text/html': markdownToHtml(markdown).then(
            html => new Blob([html], { type: 'text/html' })
          ),
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
