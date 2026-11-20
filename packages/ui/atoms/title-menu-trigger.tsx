'use client';

import { ChevronDown } from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/utils';

export interface TitleMenuTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** The page title shown on the trigger; it truncates inside its header. */
  readonly label: React.ReactNode;
}

const TITLE_MENU_TRIGGER_CLASS = cn(
  'inline-flex h-7 min-w-0 max-w-full items-center gap-1 rounded-lg px-1.5',
  'text-primary-token',
  'transition-colors duration-subtle ease-subtle',
  'hover:bg-surface-1 aria-expanded:bg-surface-1',
  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus/35'
);

/**
 * A page title that opens a menu, like Linear's chat history breadcrumb.
 * Spreads every prop so Radix `asChild` triggers can drive it.
 */
export const TitleMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  TitleMenuTriggerProps
>(({ label, className, type = 'button', ...props }, ref) => (
  <button
    {...props}
    ref={ref}
    type={type}
    className={cn(TITLE_MENU_TRIGGER_CLASS, className)}
  >
    <span className='min-w-0 truncate' data-slot='title-menu-label'>
      {label}
    </span>
    <ChevronDown
      aria-hidden='true'
      className='size-3.5 shrink-0 text-tertiary-token'
    />
  </button>
));
TitleMenuTrigger.displayName = 'TitleMenuTrigger';
