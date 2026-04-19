import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type DrawerInspectorGridStyle = CSSProperties & {
  '--drawer-inspector-label-width': string;
};

export interface DrawerInspectorGridProps {
  readonly children: ReactNode;
  readonly labelWidth?: number;
  readonly className?: string;
  readonly 'data-testid'?: string;
}

export function DrawerInspectorGrid({
  children,
  labelWidth = 92,
  className,
  'data-testid': testId,
}: DrawerInspectorGridProps) {
  const style: DrawerInspectorGridStyle = {
    '--drawer-inspector-label-width': `${labelWidth}px`,
  };

  return (
    <div
      data-testid={testId}
      className={cn('space-y-0.5', className)}
      style={style}
    >
      {children}
    </div>
  );
}
