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
    <article
      className={cn(
        'relative rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 to-white/0 p-8 shadow-[0_25px_60px_rgba(0,0,0,0.45)]',
        className
      )}
    >
      <div
        className='prose prose-invert max-w-none text-sm leading-relaxed [&_a]:text-blue-300 [&_a]:underline-offset-4 [&_h2]:text-white [&_h3]:text-white [&_h2::before]:content-["#"] [&_h3::before]:content-["#"] [&_h2::before]:mr-2 [&_h3::before]:mr-2 [&_h2::before]:text-xs [&_h3::before]:text-xs [&_h2::before]:font-mono [&_h3::before]:font-mono [&_h2::before]:text-blue-200/70 [&_h3::before]:text-blue-200/70 [&_h2::before]:relative [&_h3::before]:relative'
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  );
}
