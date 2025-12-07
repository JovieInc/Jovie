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
          'prose prose-neutral dark:prose-invert max-w-none',
          'prose-headings:font-semibold prose-headings:tracking-tight',
          'prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-4 prose-h2:border-t prose-h2:border-neutral-200 dark:prose-h2:border-neutral-800 prose-h2:pt-8',
          'prose-h3:text-base prose-h3:mt-6 prose-h3:mb-3',
          'prose-p:text-neutral-600 dark:prose-p:text-neutral-400 prose-p:leading-relaxed',
          'prose-a:text-neutral-900 dark:prose-a:text-white prose-a:underline prose-a:underline-offset-4 prose-a:decoration-neutral-300 dark:prose-a:decoration-neutral-600 hover:prose-a:decoration-neutral-500',
          'prose-li:text-neutral-600 dark:prose-li:text-neutral-400',
          'prose-strong:text-neutral-900 dark:prose-strong:text-white prose-strong:font-medium'
        )}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  );
}
