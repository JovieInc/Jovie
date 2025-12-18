import { cn } from '@/lib/utils';

export interface LegalMarkdownReaderProps {
  html: string;
  className?: string;
}

export function LegalMarkdownReader({
  html,
  className,
}: LegalMarkdownReaderProps) {
  return (
    <article className={cn('relative', className)}>
      <div
        className={cn(
          'prose prose-neutral dark:prose-invert max-w-none prose-base',
          // Headings - improved hierarchy and spacing
          'prose-headings:font-semibold prose-headings:tracking-tight',
          'prose-h1:text-3xl prose-h1:mb-4 prose-h1:mt-0',
          'prose-h2:text-2xl prose-h2:mt-16 prose-h2:mb-6 prose-h2:pb-4 prose-h2:border-b prose-h2:border-neutral-200 dark:prose-h2:border-neutral-800',
          'prose-h3:text-lg prose-h3:font-semibold prose-h3:mt-10 prose-h3:mb-4',
          // Paragraphs - better spacing and readability
          'prose-p:text-base prose-p:leading-relaxed prose-p:text-neutral-600 dark:prose-p:text-neutral-400 prose-p:mb-6',
          // Lists - improved spacing and visual separation
          'prose-ul:my-6 prose-ul:space-y-3 prose-ul:pl-6',
          'prose-li:text-base prose-li:leading-relaxed prose-li:text-neutral-600 dark:prose-li:text-neutral-400 prose-li:pl-2',
          'prose-li:marker:text-neutral-500 dark:prose-li:marker:text-neutral-500',
          // Links
          'prose-a:text-neutral-900 dark:prose-a:text-white prose-a:underline prose-a:underline-offset-4 prose-a:decoration-neutral-300 dark:prose-a:decoration-neutral-600 hover:prose-a:decoration-neutral-500',
          // Strong
          'prose-strong:text-neutral-900 dark:prose-strong:text-white prose-strong:font-medium',
          // Emphasis (italics) for dates
          'prose-em:text-neutral-500 dark:prose-em:text-neutral-500 prose-em:text-sm prose-em:not-italic'
        )}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  );
}
