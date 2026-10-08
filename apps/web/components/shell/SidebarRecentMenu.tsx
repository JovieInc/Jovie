'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@jovie/ui';
import { ChevronLeft, ChevronRight, History } from 'lucide-react';
import Link from 'next/link';
import { useContext, useEffect, useMemo, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { SidebarContext } from './SidebarContext';
import {
  getSidebarNavIconClassName,
  getSidebarNavRowClassName,
} from './SidebarNavItem';
import {
  SidebarThreadsSection,
  type SidebarThreadsSectionProps,
} from './SidebarThreadsSection';
import { useSidebarFlyout } from './useSidebarFlyout';

export function SidebarRecentMenu(
  props: Omit<SidebarThreadsSectionProps, 'collapsed'> & {
    readonly historyHref?: string;
    readonly onOpenChange?: (open: boolean) => void;
  }
) {
  const flyout = useSidebarFlyout('recent');
  const { onOpenChange: notifyOpenChange, threads: sourceThreads } = props;
  useEffect(
    () => notifyOpenChange?.(flyout.open),
    [notifyOpenChange, flyout.open]
  );
  const mobile = useContext(SidebarContext)?.isMobile ?? false;
  const sortedIds = useMemo(() => {
    const sorted = [...sourceThreads].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    );
    return sorted.slice(0, 5).map(thread => thread.id);
  }, [sourceThreads]);
  const [frozenIds, setFrozenIds] = useState(sortedIds);
  useEffect(() => {
    if (!flyout.open || frozenIds.length === 0) {
      setFrozenIds(previous =>
        previous.length === sortedIds.length &&
        previous.every((id, index) => id === sortedIds[index])
          ? previous
          : sortedIds
      );
    }
  }, [flyout.open, frozenIds.length, sortedIds]);
  const threads = useMemo(() => {
    const ids = !flyout.open || frozenIds.length === 0 ? sortedIds : frozenIds;
    const byId = new Map(sourceThreads.map(thread => [thread.id, thread]));
    return ids.flatMap(id => {
      const thread = byId.get(id);
      return thread ? [thread] : [];
    });
  }, [sourceThreads, flyout.open, frozenIds, sortedIds]);
  const attention = props.threads.some(
    thread => thread.unread || thread.status !== 'complete'
  );
  return (
    <Popover open={flyout.open} onOpenChange={flyout.onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type='button'
          aria-label='Recent Chats'
          data-sidebar-flyout='recent-trigger'
          data-sidebar-flyout-owner='recent'
          {...flyout.hover}
          onClick={flyout.activate}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ')
              flyout.activate(event);
          }}
          className={getSidebarNavRowClassName({
            calm: true,
            active: Boolean(props.activeThreadId) || props.allThreadsActive,
          })}
        >
          <History
            aria-hidden='true'
            className={getSidebarNavIconClassName({ calm: true })}
          />
          <span className='min-w-0 truncate text-left'>Recent</span>
          {attention ? (
            <span
              role='status'
              aria-label='Recent Chats Have Unread Or Active Updates'
              className='absolute right-7 size-1.5 rounded-full bg-accent'
            />
          ) : null}
          <ChevronRight
            aria-hidden='true'
            className='absolute right-2.5 size-3.5 text-tertiary-token'
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={mobile ? 'bottom' : 'right'}
        portalProps={
          mobile
            ? {
                container: document.querySelector<HTMLElement>(
                  '[data-sidebar="sidebar"][data-mobile="true"]'
                ),
              }
            : undefined
        }
        align='start'
        sideOffset={8}
        size='bare'
        collisionPadding={flyout.collisionPadding}
        data-rail-owned-overlay='left'
        data-sidebar-flyout='recent'
        data-sidebar-flyout-owner='recent'
        {...flyout.hover}
        onCloseAutoFocus={flyout.onCloseAutoFocus}
        onOpenAutoFocus={event => {
          if (!flyout.explicit.current) event.preventDefault();
        }}
        className={
          mobile
            ? 'w-[calc(var(--sidebar-width)-1rem)] overflow-hidden'
            : 'w-80 overflow-hidden'
        }
      >
        <div className='flex h-80 max-h-(--radix-popover-content-available-height) flex-col overflow-hidden [@media(pointer:coarse)]:[&_button]:min-h-11 [@media(pointer:coarse)]:[&_button]:min-w-11'>
          <div className='shrink-0 px-3 py-2 text-xs font-medium text-primary-token'>
            {mobile ? (
              <button
                type='button'
                onClick={() => flyout.onOpenChange(false)}
                className='flex min-h-11 items-center gap-2 focus-ring-themed'
              >
                <ChevronLeft aria-hidden='true' className='size-4' />
                Back
              </button>
            ) : null}
            Recent chats
          </div>
          <div className='min-h-0 flex-1 overflow-y-auto px-2'>
            {props.state === 'idle' && !threads.length ? (
              <p className='px-2.5 py-2 text-xs text-secondary-token'>
                No recent chats
              </p>
            ) : null}
            <SidebarThreadsSection
              {...props}
              threads={threads}
              onSelect={id => {
                props.onSelect?.(id);
                flyout.onOpenChange(false);
              }}
              preserveOrder
              hideAllThreadsLink
              collapsed={false}
              calm
            />
          </div>
          <Link
            href={props.historyHref ?? APP_ROUTES.CHATS}
            onClick={() => flyout.onOpenChange(false)}
            aria-current={props.allThreadsActive ? 'page' : undefined}
            className='[@media(pointer:coarse)]:min-h-11 flex items-center shrink-0 border-t border-subtle px-3 py-2 text-xs text-primary-token focus-ring-themed hover:bg-sidebar-accent'
          >
            All chats
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
