import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const DRAWER_SURFACE_CARD_CLASSNAME =
  'rounded-[12px] border border-(--linear-app-frame-seam) bg-surface-0';

export interface DrawerSurfaceCardProps {
  readonly children: ReactNode;
  readonly as?: ElementType;
  readonly className?: string;
  readonly testId?: string;
}

export function DrawerSurfaceCard({
  children,
  as: Component = 'div',
  className,
  testId,
}: DrawerSurfaceCardProps) {
  return (
    <Component
      data-testid={testId}
      className={cn(DRAWER_SURFACE_CARD_CLASSNAME, className)}
    >
      {children}
    </Component>
  );
}
