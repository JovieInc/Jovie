import { Badge } from '@jovie/ui';

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
    <Badge size={size} variant={variant} className={className}>
      {children}
    </Badge>
  );
}
