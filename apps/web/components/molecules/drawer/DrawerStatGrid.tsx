'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { DrawerSurfaceCard } from './DrawerSurfaceCard';

export interface DrawerStatGridProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly variant?: 'card' | 'flush' | 'quiet';
}

export function DrawerStatGrid({
  children,
  className,
  variant = 'flush',
}: DrawerStatGridProps) {
  return (
    <DrawerSurfaceCard
      variant={
        variant === 'card' ? 'card' : variant === 'quiet' ? 'quiet' : 'flat'
      }
      className={cn(
        'grid grid-cols-2 divide-x divide-subtle',
        variant === 'card'
          ? 'p-3'
          : variant === 'quiet'
            ? 'p-2.5'
            : 'rounded-none border-x-0 border-y-0 bg-transparent p-0 shadow-none',
        className
      )}
    >
      {children}
    </DrawerSurfaceCard>
  );
}
