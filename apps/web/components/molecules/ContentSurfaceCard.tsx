import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const contentSurfaceCardVariants = cva(
  'border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) shadow-[var(--linear-app-card-shadow)]',
  {
    variants: {
      surface: {
        default: 'rounded-[10px]',
        details: 'rounded-[10px]',
        marketing: 'rounded-xl',
        nested: 'rounded-[8px]',
        settings: 'rounded-[10px] px-4 py-3 sm:px-5',
        table: 'rounded-[10px]',
      },
    },
    defaultVariants: {
      surface: 'default',
    },
  }
);

/** @deprecated Use `contentSurfaceCardVariants` instead for new code. */
export const CONTENT_SURFACE_CARD_CLASSNAME =
  'rounded-[10px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) shadow-[var(--linear-app-card-shadow)]';

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
