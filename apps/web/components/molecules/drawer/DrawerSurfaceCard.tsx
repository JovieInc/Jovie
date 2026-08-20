import { Card } from '@jovie/ui';
import {
  type ComponentPropsWithoutRef,
  type ElementType,
  forwardRef,
} from 'react';
import { LINEAR_SURFACE } from '@/components/tokens/linear-surface';
import { cn } from '@/lib/utils';

export const DRAWER_SURFACE_CARD_CLASSNAME = LINEAR_SURFACE.drawerCard;

export interface DrawerSurfaceCardProps
  extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  readonly children: ComponentPropsWithoutRef<'div'>['children'];
  readonly as?: ElementType;
  readonly testId?: string;
  readonly variant?: 'card' | 'flat';
  readonly 'data-right-rail-section'?: string;
}

export const DrawerSurfaceCard = forwardRef<
  HTMLElement,
  DrawerSurfaceCardProps
>(function DrawerSurfaceCard(
  {
    children,
    as: Component = 'div',
    className,
    testId,
    variant = 'flat',
    'data-right-rail-section': rightRailSection,
    ...props
  },
  ref
) {
  return (
    <Card
      asChild
      unstyled
      className={cn(
        variant === 'card'
          ? DRAWER_SURFACE_CARD_CLASSNAME
          : 'border-0 bg-transparent shadow-none',
        className
      )}
    >
      <Component
        ref={ref}
        data-testid={testId}
        data-variant={variant}
        data-surface-variant={variant}
        data-right-rail-section={rightRailSection}
        {...props}
      >
        {children}
      </Component>
    </Card>
  );
});
