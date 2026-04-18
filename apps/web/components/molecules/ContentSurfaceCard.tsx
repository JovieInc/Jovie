import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const contentSurfaceCardVariants = cva(
  'border border-(--linear-app-shell-border) bg-surface-1 shadow-none',
  {
    variants: {
      surface: {
        default: 'rounded-xl',
        details: 'rounded-xl',
        marketing: 'rounded-xl',
        nested: 'rounded-[10px]',
        settings: 'rounded-xl',
        table: 'rounded-xl',
      },
    },
    defaultVariants: {
      surface: 'default',
    },
  }
);

/** @deprecated Use `contentSurfaceCardVariants` instead for new code. */
export const CONTENT_SURFACE_CARD_CLASSNAME =
  'rounded-xl border border-(--linear-app-shell-border) bg-surface-1 shadow-none';

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
