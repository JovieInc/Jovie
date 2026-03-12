'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { DrawerSectionHeading } from './DrawerSectionHeading';

export interface DrawerSectionProps {
  readonly title?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

export function DrawerSection({
  title,
  children,
  className,
}: DrawerSectionProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {title ? <DrawerSectionHeading>{title}</DrawerSectionHeading> : null}
      {children}
    </div>
  );
}
