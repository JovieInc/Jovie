import { Badge } from '@jovie/ui';

/**
 * Table label pills use the approved `outline` Badge variant (hairline,
 * unfilled). Size `sm` keeps them to one 20px text line; no restyling.
 */

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
      variant='outline'
      data-table-badge={variant}
      className={className}
    >
      {children}
    </Badge>
  );
}
