'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { DrawerSurfaceCard } from './DrawerSurfaceCard';

export interface DrawerStatGridProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function DrawerStatGrid({ children, className }: DrawerStatGridProps) {
  return (
    <DrawerSurfaceCard
      className={cn(
        'grid grid-cols-2 divide-x divide-(--linear-border-subtle) p-2.5',
        className
      )}
    >
      {children}
    </DrawerSurfaceCard>
  );
}
