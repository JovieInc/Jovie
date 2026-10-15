import { BlogMarkdownReader } from '@/components/molecules/BlogMarkdownReader';

export interface LegalMarkdownReaderProps {
  readonly html: string;
  readonly className?: string;
}

/** Legal and editorial documents use the same sanitized prose and tokens. */
export function LegalMarkdownReader({
  html,
  className,
}: LegalMarkdownReaderProps) {
  return (
    <article className={className}>
      <BlogMarkdownReader html={html} />
    </article>
  );
}
