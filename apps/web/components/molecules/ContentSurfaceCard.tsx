import { Card } from '@jovie/ui';
import { cva, type VariantProps } from 'class-variance-authority';
import {
  type ComponentPropsWithoutRef,
  type ElementType,
  forwardRef,
} from 'react';
import { cn } from '@/lib/utils';

const contentSurfaceCardVariants = cva(
  'border border-(--app-shell-border) shadow-none',
  {
    variants: {
      surface: {
        default: 'rounded-xl bg-surface-1',
        details: 'rounded-xl bg-surface-1',
        marketing: 'rounded-xl bg-surface-1',
        nested: 'rounded-lg bg-surface-0',
        settings: 'rounded-xl bg-surface-1',
        table: 'rounded-xl bg-surface-1',
      },
    },
    defaultVariants: {
      surface: 'default',
    },
  }
);

/** @deprecated Use `contentSurfaceCardVariants` instead for new code. */
export const CONTENT_SURFACE_CARD_CLASSNAME = contentSurfaceCardVariants();

export interface ContentSurfaceCardProps
  extends Omit<ComponentPropsWithoutRef<'div'>, 'children'>,
    VariantProps<typeof contentSurfaceCardVariants> {
  readonly children?: ComponentPropsWithoutRef<'div'>['children'];
  readonly as?: ElementType;
}

export const ContentSurfaceCard = forwardRef<
  HTMLElement,
  ContentSurfaceCardProps
>(function ContentSurfaceCard(
  { children, as: Component = 'div', surface, className, ...props },
  ref
) {
  return (
    <Card
      asChild
      unstyled
      className={cn(contentSurfaceCardVariants({ surface }), className)}
    >
      <Component ref={ref} {...props}>
        {children}
      </Component>
    </Card>
  );
});

export { contentSurfaceCardVariants };
