import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const DRAWER_SURFACE_CARD_CLASSNAME =
  'rounded-[9px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]';

export interface DrawerSurfaceCardProps {
  readonly children: ReactNode;
  readonly as?: ElementType;
  readonly className?: string;
}

export function DrawerSurfaceCard({
  children,
  as: Component = 'div',
  className,
}: DrawerSurfaceCardProps) {
  return (
    <Component className={cn(DRAWER_SURFACE_CARD_CLASSNAME, className)}>
      {children}
    </Component>
  );
}
