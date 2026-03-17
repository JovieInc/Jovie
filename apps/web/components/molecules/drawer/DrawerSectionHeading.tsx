'use client';

import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const DRAWER_SECTION_HEADING_CLASSNAME =
  'text-[10px] font-[510] uppercase tracking-[0.06em] text-tertiary-token';

export interface DrawerSectionHeadingProps {
  readonly children: ReactNode;
  readonly as?: ElementType;
  readonly className?: string;
}

export function DrawerSectionHeading({
  children,
  as: Component = 'div',
  className,
}: DrawerSectionHeadingProps) {
  return (
    <Component className={cn(DRAWER_SECTION_HEADING_CLASSNAME, className)}>
      {children}
    </Component>
  );
}
