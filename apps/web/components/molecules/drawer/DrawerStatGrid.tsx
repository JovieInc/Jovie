'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { DrawerSurfaceCard } from './DrawerSurfaceCard';

export interface DrawerStatGridProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly variant?: 'card' | 'flush' | 'quiet';
}

const SURFACE_VARIANT: Record<
  NonNullable<DrawerStatGridProps['variant']>,
  'card' | 'quiet' | 'flat'
> = { card: 'card', quiet: 'quiet', flush: 'flat' };

const PADDING_CLASSNAMES: Record<
  NonNullable<DrawerStatGridProps['variant']>,
  string
> = {
  card: 'p-3',
  quiet: 'p-2.5',
  flush: 'rounded-none border-x-0 border-y-0 bg-transparent p-0 shadow-none',
};

export function DrawerStatGrid({
  children,
  className,
  variant = 'flush',
}: DrawerStatGridProps) {
  return (
    <DrawerSurfaceCard
      variant={SURFACE_VARIANT[variant]}
      className={cn(
        'grid grid-cols-2 divide-x divide-subtle',
        PADDING_CLASSNAMES[variant],
        className
      )}
    >
      {children}
    </DrawerSurfaceCard>
  );
}
