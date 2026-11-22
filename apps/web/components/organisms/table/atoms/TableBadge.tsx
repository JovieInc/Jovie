import { Badge } from '@jovie/ui';
import { cn } from '../table.styles';

/** Table label pills are hairline-outlined, unfilled, and at most 20px tall. */
const HAIRLINE_PILL =
  'h-5 border-(--color-border-default) bg-transparent leading-4';

export interface TableBadgeProps
  extends Readonly<{
    readonly variant: 'primary' | 'secondary' | 'success' | 'warning' | 'error';
    readonly children: React.ReactNode;
    readonly className?: string;
    readonly size?: 'sm' | 'md' | 'lg';
  }> {}

export function TableBadge({
  variant,
  children,
  className,
  size = 'sm',
}: TableBadgeProps) {
  return (
    <Badge
      size={size}
      variant={variant}
      className={cn(HAIRLINE_PILL, className)}
    >
      {children}
    </Badge>
  );
}
