import type { ElementType, ReactNode } from 'react';
import { LINEAR_SURFACE } from '@/components/tokens/linear-surface';
import { cn } from '@/lib/utils';

export const DRAWER_SURFACE_CARD_CLASSNAME = LINEAR_SURFACE.drawerCard;
export const DRAWER_SURFACE_QUIET_CARD_CLASSNAME =
  'rounded-xl border border-[color-mix(in_oklab,var(--linear-app-shell-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--linear-app-content-surface)_98%,var(--linear-app-shell-border)_2%)] shadow-none dark:border-[color-mix(in_oklab,var(--linear-app-frame-seam)_48%,transparent)] dark:bg-[color-mix(in_oklab,var(--linear-app-content-surface)_97%,transparent)]';

export interface DrawerSurfaceCardProps {
  readonly children: ReactNode;
  readonly as?: ElementType;
  readonly className?: string;
  readonly testId?: string;
  readonly variant?: 'card' | 'flat' | 'quiet';
  readonly id?: string;
  readonly hidden?: boolean;
  readonly 'aria-busy'?: boolean;
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
}: DrawerSurfaceCardProps) {
  return (
    <Component
      id={id}
      hidden={hidden}
      aria-busy={ariaBusy}
      data-testid={testId}
      data-variant={variant}
      data-surface-variant={variant}
      className={cn(
        variant === 'quiet'
          ? DRAWER_SURFACE_QUIET_CARD_CLASSNAME
          : 'border-0 bg-transparent shadow-none',
        className
      )}
    >
      {children}
    </Component>
  );
}
