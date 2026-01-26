import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type CategorySectionVariant = 'card' | 'flat';

export interface CategorySectionProps {
  title: string;
  children: ReactNode;
  variant?: CategorySectionVariant;
  className?: string;
  gridClassName?: string;
}

export function CategorySection({
  title,
  children,
  variant = 'card',
  className,
  gridClassName,
}: CategorySectionProps) {
  return (
    <section
      className={cn(
        variant === 'flat' ? 'py-2' : 'rounded-xl bg-surface-1/60 p-3',
        className
      )}
    >
      <div className='flex items-center justify-between'>
        <h3 className='text-[11px] font-semibold tracking-wider text-secondary-token'>
          {title}
        </h3>
      </div>
      <div className='relative'>
        {/* Left fade gradient */}
        <div
          className={cn(
            'pointer-events-none absolute left-0 top-0 z-10 h-full w-8 bg-linear-to-r to-transparent',
            variant === 'flat'
              ? 'from-(--color-bg-surface-0)'
              : 'from-(--color-bg-surface-1)'
          )}
        />

        {/* Scrollable container */}
        <div
          className={cn(
            variant === 'flat'
              ? 'mt-2 flex items-start gap-1.5 overflow-x-auto scrollbar-hide'
              : 'mt-2 flex items-start gap-2 overflow-x-auto scrollbar-hide',
            gridClassName
          )}
        >
          {children}
        </div>

        {/* Right fade gradient */}
        <div
          className={cn(
            'pointer-events-none absolute right-0 top-0 z-10 h-full w-8 bg-linear-to-l to-transparent',
            variant === 'flat'
              ? 'from-(--color-bg-surface-0)'
              : 'from-(--color-bg-surface-1)'
          )}
        />
      </div>
    </section>
  );
}
