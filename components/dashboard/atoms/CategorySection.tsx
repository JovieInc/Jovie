import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface CategorySectionProps {
  title: string;
  children: ReactNode;
  className?: string;
  gridClassName?: string;
}

export function CategorySection({
  title,
  children,
  className,
  gridClassName,
}: CategorySectionProps) {
  return (
    <section
      className={cn(
        'rounded-xl border border-subtle bg-surface-1/60 p-3',
        className
      )}
    >
      <div className='flex items-center justify-between'>
        <h3 className='text-[11px] font-semibold uppercase tracking-[0.12em] text-secondary-token'>
          {title}
        </h3>
      </div>
      <div
        className={cn('mt-2 flex flex-wrap items-start gap-2', gridClassName)}
      >
        {children}
      </div>
    </section>
  );
}
