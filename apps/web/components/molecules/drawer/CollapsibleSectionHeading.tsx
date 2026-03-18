'use client';

import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { DRAWER_SECTION_HEADING_CLASSNAME } from './DrawerSectionHeading';

export interface CollapsibleSectionHeadingProps {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
  readonly className?: string;
  readonly 'aria-controls'?: string;
}

export function CollapsibleSectionHeading({
  isOpen,
  onToggle,
  children,
  className,
  'aria-controls': ariaControls,
}: CollapsibleSectionHeadingProps) {
  return (
    <button
      type='button'
      onClick={onToggle}
      aria-expanded={isOpen}
      aria-controls={ariaControls}
      className={cn(
        DRAWER_SECTION_HEADING_CLASSNAME,
        'flex w-full items-center justify-between rounded-[8px] px-1.5 py-1 transition-[background-color,color] duration-150',
        'hover:bg-(--linear-bg-surface-1)/75 hover:text-(--linear-text-secondary)',
        'focus-visible:bg-(--linear-bg-surface-1)/75 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)',
        className
      )}
    >
      <span>{children}</span>
      <ChevronDown
        className={cn(
          'h-3.5 w-3.5 transition-transform duration-150',
          !isOpen && '-rotate-90'
        )}
      />
    </button>
  );
}
