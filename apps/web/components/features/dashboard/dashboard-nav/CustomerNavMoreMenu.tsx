'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { SidebarMenuItem } from '@/components/organisms/Sidebar';
import {
  getSidebarNavIconClassName,
  getSidebarNavRowClassName,
} from '@/components/shell/SidebarNavItem';
import { Tooltip } from '@/components/shell/Tooltip';
import type { NavigationInputMethod } from '@/lib/tracking/navigation-telemetry-contract';
import { cn } from '@/lib/utils';

import type { NavItem } from './types';

export interface CustomerNavMoreMenuProps {
  readonly items: readonly NavItem[];
  readonly isItemActive: (item: NavItem) => boolean;
  readonly onActivate?: (
    item: NavItem,
    inputMethod: NavigationInputMethod
  ) => void;
  readonly onPrefetch?: (itemId: string) => void;
}

/**
 * Single canonical More menu for customer primary-rail overflow (JOV-4515).
 * Desktop sidebar only — mobile uses the shared LiquidGlassMenu More surface
 * fed by the same capacity partition.
 */
export function CustomerNavMoreMenu({
  items,
  isItemActive,
  onActivate,
  onPrefetch,
}: CustomerNavMoreMenuProps) {
  const [open, setOpen] = useState(false);
  const hasActiveOverflow = items.some(item => isItemActive(item));

  if (items.length === 0) {
    return null;
  }

  return (
    <SidebarMenuItem>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <Tooltip label='More' side='right' block>
          <DropdownMenuTrigger asChild>
            <button
              type='button'
              aria-label={open ? 'Close menu' : 'More options'}
              aria-expanded={open}
              aria-haspopup='menu'
              data-customer-nav-more='true'
              data-has-active-overflow={hasActiveOverflow ? 'true' : 'false'}
              className={getSidebarNavRowClassName({
                active: hasActiveOverflow && !open,
                className: cn(
                  'group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0',
                  open && 'bg-sidebar-accent text-primary-token'
                ),
              })}
            >
              <MoreHorizontal
                className={getSidebarNavIconClassName({
                  active: hasActiveOverflow || open,
                })}
                strokeWidth={2.25}
                aria-hidden='true'
              />
              <span className='min-w-0 truncate text-left justify-self-start group-data-[collapsible=icon]:hidden'>
                More
              </span>
              {hasActiveOverflow ? (
                <span
                  className='h-1.5 w-1.5 shrink-0 justify-self-end rounded-full bg-accent group-data-[collapsible=icon]:hidden'
                  aria-hidden='true'
                />
              ) : null}
            </button>
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent
          side='right'
          align='start'
          sideOffset={8}
          className='min-w-44'
          aria-label='More Navigation'
        >
          {items.map(item => {
            const active = isItemActive(item);
            const Icon = item.icon;
            return (
              <DropdownMenuItem key={item.id} asChild>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  data-customer-nav-more-item={item.id}
                  onMouseEnter={() => onPrefetch?.(item.id)}
                  onFocus={() => onPrefetch?.(item.id)}
                  onClick={event => {
                    if (
                      event.button === 0 &&
                      !event.metaKey &&
                      !event.ctrlKey &&
                      !event.shiftKey &&
                      !event.altKey
                    ) {
                      onActivate?.(
                        item,
                        event.detail === 0 ? 'keyboard' : 'pointer'
                      );
                    }
                    setOpen(false);
                  }}
                  className={cn(
                    'flex cursor-pointer items-center gap-2',
                    active && 'font-medium text-primary-token'
                  )}
                >
                  <Icon className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
                  <span className='min-w-0 truncate'>{item.name}</span>
                </Link>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}
