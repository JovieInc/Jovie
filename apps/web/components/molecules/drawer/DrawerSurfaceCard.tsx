import type { ElementType, ReactNode } from 'react';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import { cn } from '@/lib/utils';

export const DRAWER_SURFACE_CARD_CLASSNAME = LINEAR_SURFACE.drawerCard;

export interface DrawerSurfaceCardProps {
  readonly children: ReactNode;
  readonly as?: ElementType;
  readonly className?: string;
  readonly testId?: string;
  readonly variant?: 'card' | 'flat';
  readonly id?: string;
  readonly hidden?: boolean;
}

export function DrawerSurfaceCard({
  children,
  as: Component = 'div',
  className,
  testId,
  variant = 'flat',
  id,
  hidden,
}: DrawerSurfaceCardProps) {
  return (
    <Component
      id={id}
      hidden={hidden}
      data-testid={testId}
      className={cn(
        variant === 'card'
          ? DRAWER_SURFACE_CARD_CLASSNAME
          : 'border-0 bg-transparent shadow-none',
        className
      )}
    >
      {children}
    </Component>
  );
}
