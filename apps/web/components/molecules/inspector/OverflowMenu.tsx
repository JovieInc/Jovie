'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
} from '@jovie/ui';
import { MoreHorizontal } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface OverflowMenuItem {
  readonly id: string;
  readonly label: string;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  readonly variant?: 'default' | 'destructive';
  readonly icon?: ReactNode;
  readonly separatorBefore?: boolean;
}

export interface OverflowMenuProps {
  readonly label: string;
  readonly items: readonly OverflowMenuItem[];
  readonly align?: 'start' | 'center' | 'end';
  readonly disabled?: boolean;
  readonly className?: string;
  readonly testId?: string;
}

/** L4 inspector overflow for rare or destructive verbs. */
export function OverflowMenu({
  label,
  items,
  align = 'end',
  disabled = false,
  className,
  testId,
}: OverflowMenuProps) {
  const visibleItems = items.filter(Boolean);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          type='button'
          variant='inline'
          size='sm'
          aria-label={label}
          disabled={disabled || visibleItems.length === 0}
          data-testid={testId}
          data-disclosure-level='l4'
          className={cn(
            'text-tertiary-token hover:text-primary-token',
            className
          )}
        >
          <MoreHorizontal className='h-3.5 w-3.5' aria-hidden='true' />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} sideOffset={4}>
        {visibleItems.map(item => (
          <Fragment key={item.id}>
            {item.separatorBefore ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              variant={item.variant}
              disabled={item.disabled}
              onSelect={item.onSelect}
            >
              {item.icon}
              {item.label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
