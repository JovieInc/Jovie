'use client';

import { Label } from '@jovie/ui';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const DRAWER_FORM_GRID_ROW_CLASSNAME = 'grid items-center gap-2';

export const DRAWER_FORM_GRID_LABEL_CLASSNAME =
  'text-[11px] font-[500] leading-[15px] tracking-normal text-quaternary-token';

export interface DrawerFormGridRowProps {
  readonly label: ReactNode;
  readonly htmlFor?: string;
  readonly className?: string;
  readonly labelClassName?: string;
  readonly children: ReactNode;
}

const DRAWER_FORM_GRID_ROW_STYLE: CSSProperties = {
  gridTemplateColumns:
    'var(--drawer-inspector-label-width, 92px) minmax(0, 1fr)',
};

export function DrawerFormGridRow({
  label,
  htmlFor,
  className,
  labelClassName,
  children,
}: DrawerFormGridRowProps) {
  return (
    <div
      className={cn(DRAWER_FORM_GRID_ROW_CLASSNAME, className)}
      style={DRAWER_FORM_GRID_ROW_STYLE}
    >
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
