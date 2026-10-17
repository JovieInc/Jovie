import { BlogMarkdownReader } from '@/components/molecules/BlogMarkdownReader';

export interface LegalMarkdownReaderProps {
  readonly html: string;
  readonly className?: string;
}

/**
 * Wide legal tables and code blocks scroll horizontally. Axe requires that
 * scroll container to be keyboard-reachable. Existing tabindex values stay.
 */
export function focusLegalScrollRegions(html: string): string {
  return html.replace(
    /<(table|pre)\b([^>]*?)>/gi,
    (match, tag: string, attrs: string) => {
      if (/\btabindex\s*=/i.test(` ${attrs}`)) return match;
      return `<${tag}${attrs} tabindex="0">`;
    }
  );
}

/** Legal and editorial documents use the same sanitized prose and tokens. */
export function LegalMarkdownReader({
  html,
  className,
}: LegalMarkdownReaderProps) {
  return (
    <article className={className}>
      <BlogMarkdownReader html={focusLegalScrollRegions(html)} />
    </article>
  );
}
