import { cn } from '@/lib/utils';

/** One dependency level uses the measured 24px Linear gutter, without moving row actions. */
export function TableDependencyGuide({
  last = false,
  className,
}: {
  readonly last?: boolean;
  readonly className?: string;
}) {
  return (
    <span
      aria-hidden='true'
      data-testid='table-dependency-guide'
      data-last={last ? 'true' : 'false'}
      className={cn('relative w-6 shrink-0 self-stretch', className)}
    >
      <span
        className={cn(
          'absolute left-3 top-0 border-l border-subtle',
          last ? 'h-1/2' : 'bottom-0'
        )}
      />
      <span className='absolute left-3 top-1/2 w-3 border-t border-subtle' />
    </span>
  );
}
