'use client';

import { Label } from '@jovie/ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const DRAWER_FIELD_LABEL_CLASSNAME =
  'text-[11px] font-[510] tracking-[-0.01em] text-secondary-token';

export const DRAWER_FIELD_HELPER_CLASSNAME =
  'text-[10.5px] leading-[14px] text-tertiary-token';

export interface DrawerFormFieldProps {
  readonly label: ReactNode;
  readonly htmlFor?: string;
  readonly helperText?: ReactNode;
  readonly className?: string;
  readonly children: ReactNode;
}

export function DrawerFormField({
  label,
  htmlFor,
  helperText,
  className,
  children,
}: DrawerFormFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor} className={DRAWER_FIELD_LABEL_CLASSNAME}>
        {label}
      </Label>
      {children}
      {helperText ? (
        <p className={DRAWER_FIELD_HELPER_CLASSNAME}>{helperText}</p>
      ) : null}
    </div>
  );
}
