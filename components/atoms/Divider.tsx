import React from 'react';
import { cn } from '@/lib/utils';

export type DividerProps = {
  className?: string;
  inset?: boolean; // adds horizontal padding inset for alignment with content
};

// Standard horizontal divider aligning with our border tokens
export function Divider({ className, inset = false }: DividerProps) {
  return (
    <div
      role='separator'
      aria-orientation='horizontal'
      className={cn('border-t border-subtle', inset ? 'mx-3' : '', className)}
    />
  );
}
