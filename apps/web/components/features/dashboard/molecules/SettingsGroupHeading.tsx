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
        'text-app font-caption tracking-[-0.01em] text-secondary-token',
        className
      )}
    >
      {children}
    </h3>
  );
}
