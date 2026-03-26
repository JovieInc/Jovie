'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SettingsGroupHeadingProps {
  readonly children: ReactNode;
  readonly className?: string;
}

export function SettingsGroupHeading({
  children,
  className,
}: Readonly<SettingsGroupHeadingProps>) {
  return (
    <h3
      className={cn(
        'text-[12px] font-[510] tracking-normal text-tertiary-token',
        className
      )}
    >
      {children}
    </h3>
  );
}
