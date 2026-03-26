'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { DrawerSurfaceCard } from './DrawerSurfaceCard';

export interface DrawerTabbedCardProps {
  readonly tabs: ReactNode;
  readonly children: ReactNode;
  readonly controls?: ReactNode;
  readonly className?: string;
  readonly tabsContainerClassName?: string;
  readonly contentClassName?: string;
  readonly testId?: string;
}

export function DrawerTabbedCard({
  tabs,
  children,
  controls,
  className,
  tabsContainerClassName,
  contentClassName,
  testId,
}: DrawerTabbedCardProps) {
  return (
    <DrawerSurfaceCard
      variant='card'
      className={cn('overflow-hidden', className)}
      testId={testId}
    >
      <div
        className={cn(
          'flex items-center gap-1.5 px-2.5 pt-2.5',
          tabsContainerClassName
        )}
      >
        <div className='min-w-0 flex-1 [&>*]:w-full'>{tabs}</div>
        {controls ? <div className='shrink-0'>{controls}</div> : null}
      </div>
      <div className={cn('px-2.5 pb-2.5 pt-2', contentClassName)}>
        {children}
      </div>
    </DrawerSurfaceCard>
  );
}
