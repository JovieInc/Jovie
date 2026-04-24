'use client';

import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const DRAWER_SECTION_HEADING_CLASSNAME =
  'text-2xs font-semibold uppercase leading-[14px] tracking-[0.08em] text-tertiary-token';

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
