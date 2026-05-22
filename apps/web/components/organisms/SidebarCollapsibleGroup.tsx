'use client';

import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/organisms/Sidebar';
import { useIsomorphicLayoutEffect } from '@/hooks/useIsomorphicLayoutEffect';
import { cn } from '@/lib/utils';

export interface SidebarCollapsibleGroupProps {
  readonly label: string;
  readonly children: React.ReactNode;
  readonly defaultOpen?: boolean;
  readonly className?: string;
  readonly icon?: LucideIcon;
  readonly storageKey?: string;
}

const SIDEBAR_GROUP_STORAGE_PREFIX = 'jovie:sidebar-section';

function getStoredOpen(storageKey: string): boolean | null {
  try {
    const stored = globalThis.localStorage?.getItem(
      `${SIDEBAR_GROUP_STORAGE_PREFIX}:${storageKey}`
    );
    if (stored === 'open') return true;
    if (stored === 'closed') return false;
  } catch {
    return null;
  }
  return null;
}

function setStoredOpen(storageKey: string, open: boolean) {
  try {
    globalThis.localStorage?.setItem(
      `${SIDEBAR_GROUP_STORAGE_PREFIX}:${storageKey}`,
      open ? 'open' : 'closed'
    );
  } catch {
    // Storage can be unavailable in restricted browsers; the default state still works.
  }
}

export function SidebarCollapsibleGroup({
  label,
  children,
  defaultOpen = true,
  className,
  icon: GroupIcon,
  storageKey,
}: SidebarCollapsibleGroupProps) {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const hasLoadedStoredStateRef = useRef(false);

  const tooltip = useMemo(() => label, [label]);

  useIsomorphicLayoutEffect(() => {
    if (!storageKey) {
      hasLoadedStoredStateRef.current = true;
      return;
    }

    const storedOpen = getStoredOpen(storageKey);
    if (storedOpen !== null) {
      setOpen(storedOpen);
    }
    hasLoadedStoredStateRef.current = true;
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !hasLoadedStoredStateRef.current) return;
    setStoredOpen(storageKey, open);
  }, [open, storageKey]);

  return (
    <SidebarGroup className={cn('space-y-0', className)}>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            type='button'
            isActive={false}
            onClick={() => setOpen(value => !value)}
            tooltip={tooltip}
            className={cn(
              'justify-between',
              'h-7 px-2.5 text-sidebar-muted/90 hover:bg-transparent hover:text-sidebar-muted/90'
            )}
            aria-expanded={open}
          >
            <span className='truncate group-data-[collapsible=icon]:hidden text-xs font-caption tracking-normal'>
              {label}
            </span>
            {GroupIcon ? (
              <GroupIcon
                className='h-4 w-4 shrink-0 opacity-50 group-data-[collapsible=icon]:inline hidden'
                aria-hidden='true'
              />
            ) : null}
            <ChevronRight
              className={cn(
                'size-3 shrink-0 opacity-50 transition-transform duration-[160ms] [transition-timing-function:cubic-bezier(0.25,0.46,0.45,0.94)]',
                open ? 'rotate-90' : 'rotate-0'
              )}
              aria-hidden='true'
            />
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>

      <div
        inert={!open ? true : undefined}
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-[160ms] [transition-timing-function:cubic-bezier(0.25,0.46,0.45,0.94)]',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className='overflow-hidden'>
          <SidebarGroupContent className='mt-0'>{children}</SidebarGroupContent>
        </div>
      </div>
    </SidebarGroup>
  );
}
