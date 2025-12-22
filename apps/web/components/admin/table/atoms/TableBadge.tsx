import { Badge } from '@jovie/ui';

export interface TableBadgeProps {
  variant: 'primary' | 'secondary' | 'success' | 'warning' | 'error';
  children: React.ReactNode;
  className?: string;
}

export function TableBadge({ variant, children, className }: TableBadgeProps) {
  return (
    <Badge variant={variant} className={className}>
      {children}
    </Badge>
  );
}
