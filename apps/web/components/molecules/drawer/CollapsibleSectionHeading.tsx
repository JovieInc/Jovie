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
  readonly 'data-testid'?: string;
}

export function CollapsibleSectionHeading({
  isOpen,
  onToggle,
  children,
  className,
  'aria-controls': ariaControls,
  'data-testid': testId,
}: CollapsibleSectionHeadingProps) {
  return (
    <button
      type='button'
      onClick={onToggle}
      aria-expanded={isOpen}
      aria-controls={ariaControls}
      data-testid={testId}
      className={cn(
        DRAWER_SECTION_HEADING_CLASSNAME,
        'flex w-full items-center justify-between rounded-[10px] border border-transparent px-2.5 py-2 transition-[background-color,color,border-color] duration-150',
        'hover:border-(--linear-app-frame-seam) hover:bg-surface-0 hover:text-secondary-token',
        'focus-visible:border-(--linear-border-focus) focus-visible:bg-surface-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)',
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
