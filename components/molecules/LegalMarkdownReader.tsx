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
          // Headings
          'prose-headings:font-semibold prose-headings:tracking-tight',
          'prose-h1:text-2xl prose-h1:mb-2',
          'prose-h2:text-xl prose-h2:mt-12 prose-h2:mb-4 prose-h2:pb-3 prose-h2:border-b prose-h2:border-neutral-200 dark:prose-h2:border-neutral-800',
          'prose-h3:text-base prose-h3:font-semibold prose-h3:mt-8 prose-h3:mb-3',
          // Paragraphs
          'prose-p:text-[15px] prose-p:leading-7 prose-p:text-neutral-600 dark:prose-p:text-neutral-400 prose-p:mb-4',
          // Lists
          'prose-ul:my-4 prose-ul:space-y-2',
          'prose-li:text-[15px] prose-li:leading-7 prose-li:text-neutral-600 dark:prose-li:text-neutral-400 prose-li:pl-1',
          'prose-li:marker:text-neutral-400 dark:prose-li:marker:text-neutral-600',
          // Links
          'prose-a:text-neutral-900 dark:prose-a:text-white prose-a:underline prose-a:underline-offset-4 prose-a:decoration-neutral-300 dark:prose-a:decoration-neutral-600 hover:prose-a:decoration-neutral-500',
          // Strong
          'prose-strong:text-neutral-900 dark:prose-strong:text-white prose-strong:font-medium'
        )}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  );
}
