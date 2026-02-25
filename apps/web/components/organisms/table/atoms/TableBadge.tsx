import { Badge } from '@jovie/ui';
import { cn } from '@/lib/utils';

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
      className={cn('line-clamp-1', className)}
    >
      {children}
    </Badge>
  );
}
