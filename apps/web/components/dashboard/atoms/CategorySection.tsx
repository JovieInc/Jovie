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
        variant === 'flat'
          ? 'py-2'
          : 'rounded-xl border border-subtle bg-surface-1/60 p-3',
        className
      )}
    >
      <div className='flex items-center justify-between'>
        <h3 className='text-[11px] font-semibold uppercase tracking-[0.12em] text-secondary-token'>
          {title}
        </h3>
      </div>
      <div
        className={cn(
          variant === 'flat'
            ? 'mt-2 flex items-start gap-1.5 overflow-x-auto'
            : 'mt-2 flex items-start gap-2 overflow-x-auto',
          gridClassName
        )}
      >
        {children}
      </div>
    </section>
  );
}
