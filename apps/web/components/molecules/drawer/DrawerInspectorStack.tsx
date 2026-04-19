import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DrawerInspectorStackProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly 'data-testid'?: string;
}

export function DrawerInspectorStack({
  children,
  className,
  'data-testid': testId,
}: DrawerInspectorStackProps) {
  return (
    <div data-testid={testId} className={cn('space-y-2', className)}>
      {children}
    </div>
  );
}
