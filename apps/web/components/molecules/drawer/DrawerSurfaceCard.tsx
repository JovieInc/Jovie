import type { ElementType, ReactNode } from 'react';
import { LINEAR_SURFACE } from '@/components/tokens/linear-surface';
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
  readonly 'aria-busy'?: boolean;
  readonly 'data-right-rail-section'?: string;
}

export function DrawerSurfaceCard({
  children,
  as: Component = 'div',
  className,
  testId,
  variant = 'flat',
  id,
  hidden,
  'aria-busy': ariaBusy,
  'data-right-rail-section': rightRailSection,
}: DrawerSurfaceCardProps) {
  return (
    <Component
      id={id}
      hidden={hidden}
      aria-busy={ariaBusy}
      data-testid={testId}
      data-variant={variant}
      data-surface-variant={variant}
      data-right-rail-section={rightRailSection}
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
