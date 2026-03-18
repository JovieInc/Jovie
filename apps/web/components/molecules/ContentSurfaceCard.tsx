import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const contentSurfaceCardVariants = cva(
  'border bg-surface-0 shadow-subtle-bottom-xs dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]',
  {
    variants: {
      surface: {
        default: 'rounded-[10px] border-(--linear-app-frame-seam)',
        marketing: 'rounded-xl border-[var(--linear-border-subtle)]',
        settings:
          'rounded-[11px] border-subtle/55 bg-surface-0 px-4 py-4 sm:px-5',
      },
    },
    defaultVariants: {
      surface: 'default',
    },
  }
);

/** @deprecated Use `contentSurfaceCardVariants` instead for new code. */
export const CONTENT_SURFACE_CARD_CLASSNAME =
  'rounded-[10px] border border-(--linear-app-frame-seam) bg-surface-0 shadow-subtle-bottom-xs dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]';

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
