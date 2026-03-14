'use client';

import { Label } from '@jovie/ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const DRAWER_FORM_GRID_ROW_CLASSNAME =
  'grid grid-cols-[88px,minmax(0,1fr)] items-center gap-2.5';

export const DRAWER_FORM_GRID_LABEL_CLASSNAME =
  'text-[11px] font-[510] uppercase tracking-[0.08em] text-(--linear-text-tertiary)';

export interface DrawerFormGridRowProps {
  readonly label: ReactNode;
  readonly htmlFor?: string;
  readonly className?: string;
  readonly labelClassName?: string;
  readonly children: ReactNode;
}

export function DrawerFormGridRow({
  label,
  htmlFor,
  className,
  labelClassName,
  children,
}: DrawerFormGridRowProps) {
  return (
    <div className={cn(DRAWER_FORM_GRID_ROW_CLASSNAME, className)}>
      <Label
        htmlFor={htmlFor}
        className={cn(DRAWER_FORM_GRID_LABEL_CLASSNAME, labelClassName)}
      >
        {label}
      </Label>
      {children}
    </div>
  );
}
