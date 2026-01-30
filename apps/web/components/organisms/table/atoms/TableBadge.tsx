import { Badge } from '@jovie/ui';
import { cn } from '@/lib/utils';

export interface TableBadgeProps
  extends Readonly<{
    readonly variant: 'primary' | 'secondary' | 'success' | 'warning' | 'error';
    readonly children: React.ReactNode;
    readonly className?: string;
  }> {}

export function TableBadge({ variant, children, className }: TableBadgeProps) {
  return (
    <Badge variant={variant} className={cn('line-clamp-1', className)}>
      {children}
    </Badge>
  );
}
