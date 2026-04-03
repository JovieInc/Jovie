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
  readonly surfaceVariant?: 'card' | 'quiet';
}

export function DrawerTabbedCard({
  tabs,
  children,
  controls,
  className,
  tabsContainerClassName,
  contentClassName,
  testId,
  surfaceVariant = 'card',
}: DrawerTabbedCardProps) {
  return (
    <DrawerSurfaceCard
      variant={surfaceVariant}
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden',
        surfaceVariant === 'quiet' ? 'p-2' : 'p-2.5',
        className
      )}
      testId={testId}
    >
      <div
        className={cn(
          'flex shrink-0 items-start gap-2',
          tabsContainerClassName
        )}
      >
        <div className='min-w-0 flex-1 [&>*]:w-full'>{tabs}</div>
        {controls ? (
          <div className='shrink-0 self-center'>{controls}</div>
        ) : null}
      </div>
      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain',
          surfaceVariant === 'quiet'
            ? 'pb-1.5 pr-1.5 pt-1.5'
            : 'pb-2 pr-2 pt-2',
          contentClassName
        )}
      >
        {children}
      </div>
    </DrawerSurfaceCard>
  );
}
