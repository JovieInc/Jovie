import { cn } from '../table.styles';

export type StatusCellTone =
  | 'positive'
  | 'attention'
  | 'neutral'
  | 'negative'
  | 'info';

const DOT_CLASS: Record<StatusCellTone, string> = {
  positive: 'bg-success-text',
  attention: 'bg-warning',
  negative: 'bg-error',
  info: 'bg-accent',
  neutral: 'bg-quaternary-token',
};

export interface StatusCellProps {
  readonly tone: StatusCellTone;
  readonly children: React.ReactNode;
  readonly className?: string;
}

/**
 * Quiet row status: a 6px semantic dot plus secondary text. Never a filled
 * pill. Hairline label pills are for tags only (`TableBadge`).
 */
export function StatusCell({ tone, children, className }: StatusCellProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-app text-secondary-token',
        className
      )}
      data-status-cell={tone}
    >
      <span
        className={cn('size-1.5 shrink-0 rounded-full', DOT_CLASS[tone])}
        aria-hidden='true'
      />
      {children}
    </span>
  );
}
