'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { DrawerSurfaceCard } from './DrawerSurfaceCard';

export interface DrawerStatGridProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly variant?: 'card' | 'flush';
}

export function DrawerStatGrid({
  children,
  className,
  variant = 'flush',
}: DrawerStatGridProps) {
  return (
    <DrawerSurfaceCard
      variant={variant === 'card' ? 'card' : 'flat'}
      className={cn(
        'grid grid-cols-2 divide-x divide-(--linear-app-frame-seam)',
        variant === 'card'
          ? 'p-3.5'
          : 'rounded-none border-x-0 border-y-0 bg-transparent p-0 shadow-none',
        className
      )}
    >
      {children}
    </DrawerSurfaceCard>
  );
}
