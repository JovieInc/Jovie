import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const contentSurfaceCardVariants = cva('bg-surface-0', {
  variants: {
    surface: {
      default: 'rounded-lg',
      marketing: 'rounded-xl',
      settings: 'rounded-lg px-4 py-3 sm:px-5',
    },
  },
  defaultVariants: {
    surface: 'default',
  },
});

/** @deprecated Use `contentSurfaceCardVariants` instead for new code. */
export const CONTENT_SURFACE_CARD_CLASSNAME = 'rounded-lg bg-surface-0';

export interface ContentSurfaceCardProps
  extends VariantProps<typeof contentSurfaceCardVariants> {
  readonly children?: ReactNode;
  readonly as?: ElementType;
  readonly className?: string;
  readonly id?: string;
  readonly role?: string;
  readonly 'data-testid'?: string;
  readonly 'aria-hidden'?: ComponentPropsWithoutRef<'div'>['aria-hidden'];
  readonly 'aria-live'?: ComponentPropsWithoutRef<'div'>['aria-live'];
  readonly inert?: ComponentPropsWithoutRef<'div'>['inert'];
  readonly style?: ComponentPropsWithoutRef<'div'>['style'];
}

export function ContentSurfaceCard({
  children,
  as: Component = 'div',
  surface,
  className,
  ...props
}: Readonly<ContentSurfaceCardProps>) {
  return (
    <Component
      className={cn(contentSurfaceCardVariants({ surface }), className)}
      {...props}
    >
      {children}
    </Component>
  );
}

export { contentSurfaceCardVariants };
