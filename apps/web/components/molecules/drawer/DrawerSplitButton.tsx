'use client';

import { CommonDropdown, type CommonDropdownItem } from '@jovie/ui';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DrawerSplitButtonAction {
  readonly ariaLabel: string;
  readonly label?: string;
  readonly icon: ReactNode;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly testId?: string;
}

export interface DrawerSplitButtonProps {
  readonly primaryAction?: DrawerSplitButtonAction;
  readonly menuItems?: readonly CommonDropdownItem[];
  readonly menuAriaLabel?: string;
  readonly className?: string;
}

const DRAWER_SPLIT_BUTTON_BASE_CLASSNAME =
  'inline-flex h-7 shrink-0 items-stretch overflow-hidden rounded-full border border-subtle bg-surface-1 text-secondary-token shadow-none';

const DRAWER_SPLIT_BUTTON_SEGMENT_CLASSNAME =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap border-0 bg-transparent px-2.5 text-[11.5px] font-caption tracking-[-0.01em] text-secondary-token transition-[background-color,color] duration-150 hover:bg-surface-0 hover:text-primary-token focus-visible:outline-none focus-visible:bg-surface-0 focus-visible:text-primary-token disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:h-3.5 [&_svg]:w-3.5';

export function DrawerSplitButton({
  primaryAction,
  menuItems = [],
  menuAriaLabel = 'More actions',
  className,
}: DrawerSplitButtonProps) {
  const hasMenu = menuItems.length > 0;

  if (!primaryAction && !hasMenu) {
    return null;
  }

  if (!hasMenu && primaryAction) {
    return (
      <button
        type='button'
        aria-label={primaryAction.ariaLabel}
        onClick={primaryAction.onClick}
        disabled={primaryAction.disabled}
        data-testid={primaryAction.testId}
        className={cn(
          DRAWER_SPLIT_BUTTON_BASE_CLASSNAME,
          DRAWER_SPLIT_BUTTON_SEGMENT_CLASSNAME,
          primaryAction.label ? 'px-2.5' : 'w-7 px-0',
          className
        )}
      >
        {primaryAction.icon}
        {primaryAction.label ? <span>{primaryAction.label}</span> : null}
      </button>
    );
  }

  if (hasMenu && !primaryAction) {
    return (
      <CommonDropdown
        variant='dropdown'
        size='compact'
        items={[...menuItems]}
        align='end'
        trigger={
          <button
            type='button'
            aria-label={menuAriaLabel}
            className={cn(
              DRAWER_SPLIT_BUTTON_BASE_CLASSNAME,
              DRAWER_SPLIT_BUTTON_SEGMENT_CLASSNAME,
              'w-7 px-0',
              className
            )}
          >
            <ChevronDown className='h-3.5 w-3.5' aria-hidden='true' />
          </button>
        }
      />
    );
  }

  return (
    <div className={cn(DRAWER_SPLIT_BUTTON_BASE_CLASSNAME, className)}>
      {primaryAction ? (
        <button
          type='button'
          aria-label={primaryAction.ariaLabel}
          onClick={primaryAction.onClick}
          disabled={primaryAction.disabled}
          data-testid={primaryAction.testId}
          className={cn(
            DRAWER_SPLIT_BUTTON_SEGMENT_CLASSNAME,
            primaryAction.label ? 'px-2.5' : 'w-7 px-0'
          )}
        >
          {primaryAction.icon}
          {primaryAction.label ? <span>{primaryAction.label}</span> : null}
        </button>
      ) : null}
      <CommonDropdown
        variant='dropdown'
        size='compact'
        items={[...menuItems]}
        align='end'
        trigger={
          <button
            type='button'
            aria-label={menuAriaLabel}
            className={cn(
              DRAWER_SPLIT_BUTTON_SEGMENT_CLASSNAME,
              'w-7 border-l border-subtle px-0'
            )}
          >
            <ChevronDown className='h-3.5 w-3.5' aria-hidden='true' />
          </button>
        }
      />
    </div>
  );
}
