import { cn } from '@/lib/utils';

export type PriorityLevel = 'none' | 'low' | 'medium' | 'high' | 'urgent';

export interface PriorityGlyphProps {
  readonly priority: PriorityLevel;
  readonly className?: string;
}

const BARS_FOR_PRIORITY: Record<
  Exclude<PriorityLevel, 'none' | 'urgent'>,
  number
> = {
  low: 1,
  medium: 2,
  high: 3,
};

/**
 * PriorityGlyph — compact priority indicator. `'none'` renders a
 * width-preserving spacer so neighboring rows stay aligned. `'urgent'`
 * is a small rose pill with a `!`. Other levels render as 1-3 stacked
 * bars (the bar count maps to low / medium / high).
 *
 * @example
 * ```tsx
 * <PriorityGlyph priority={task.priority} />
 * ```
 */
export function PriorityGlyph({ priority, className }: PriorityGlyphProps) {
  if (priority === 'none') {
    return (
      <span
        aria-hidden='true'
        className={cn('inline-block h-2.5 w-3', className)}
      />
    );
  }
  if (priority === 'urgent') {
    return (
      <span
        title='Urgent'
        className={cn(
          'inline-flex items-center justify-center h-3 px-1 rounded text-[8px] font-bold leading-none bg-rose-500/15 text-rose-300',
          className
        )}
      >
        !
      </span>
    );
  }
  const bars = BARS_FOR_PRIORITY[priority];
  return (
    <span
      className={cn('inline-flex items-end gap-[2px] h-2.5', className)}
      title={`Priority: ${priority}`}
    >
      {[1, 2, 3].map(i => (
        <span
          key={i}
          className={cn(
            'w-[2px] rounded-sm',
            i <= bars ? 'bg-secondary-token' : 'bg-quaternary-token/30'
          )}
          style={{ height: `${30 + i * 25}%` }}
        />
      ))}
    </span>
  );
}
