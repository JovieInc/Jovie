import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const contentSurfaceCardVariants = cva(
  'border border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_95%,var(--linear-bg-surface-0))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
  {
    variants: {
      surface: {
        default: 'rounded-[12px]',
        details:
          'rounded-[12px] bg-[color-mix(in_oklab,var(--linear-app-content-surface)_96%,var(--linear-bg-surface-0))]',
        marketing: 'rounded-xl',
        nested:
          'rounded-[10px] bg-[color-mix(in_oklab,var(--linear-app-content-surface)_97%,var(--linear-bg-surface-0))]',
        settings: 'rounded-[12px] px-4 py-3 sm:px-5',
        table:
          'rounded-[12px] bg-[color-mix(in_oklab,var(--linear-app-content-surface)_96%,var(--linear-bg-surface-0))]',
      },
    },
    defaultVariants: {
      surface: 'default',
    },
  }
);

/** @deprecated Use `contentSurfaceCardVariants` instead for new code. */
export const CONTENT_SURFACE_CARD_CLASSNAME =
  'rounded-[12px] border border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_92%,var(--linear-bg-surface-0))]';

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
