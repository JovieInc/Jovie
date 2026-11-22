import { Badge } from '@jovie/ui';

/** Neutral table labels use the approved hairline, unfilled `outline` variant. */
const NEUTRAL_VARIANTS = new Set(['primary', 'secondary']);

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
      variant={NEUTRAL_VARIANTS.has(variant) ? 'outline' : variant}
      className={className}
    >
      {children}
    </Badge>
  );
}
