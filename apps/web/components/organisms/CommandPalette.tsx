'use client';

import { Dialog, DialogContent } from '@jovie/ui';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import { Keyboard, MessageSquare, Search, SquarePen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DashboardDataContext } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  adminNavigation,
  adminSettingsNavigation,
  artistSettingsNavigation,
  primaryNavigation,
  settingsNavItem,
  userSettingsNavigation,
} from '@/components/features/dashboard/dashboard-nav/config';
import type { NavItem } from '@/components/features/dashboard/dashboard-nav/types';
import { APP_ROUTES } from '@/constants/routes';
import { useKeyboardShortcutsSafe } from '@/contexts/KeyboardShortcutsContext';
import { useChatConversationsQuery } from '@/lib/queries';
import { isFormElement } from '@/lib/utils/keyboard';

const RECENT_THREAD_LIMIT = 10;

function NavItemIcon({ item }: { readonly item: NavItem }) {
  const Icon = item.icon;
  return Icon ? (
    <Icon className='size-3.5 text-sidebar-item-icon' aria-hidden='true' />
  ) : null;
}

export function CommandPalette() {
  // Read the context directly so we don't hit the throwing useDashboardData
  // hook. The palette is only useful inside authenticated shells where the
  // DashboardDataProvider and QueryClient are mounted. On pre-auth routes
  // (e.g., when AuthShellWrapper renders without its inner providers) it
  // should be a no-op instead of crashing.
  const dashboardData = useContext(DashboardDataContext);
  if (!dashboardData) {
    return null;
  }

  return <CommandPaletteInner isAdmin={dashboardData.isAdmin} />;
}

function CommandPaletteInner({ isAdmin }: { readonly isAdmin: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const keyboardShortcuts = useKeyboardShortcutsSafe();
  const { data: conversations } = useChatConversationsQuery({
    limit: RECENT_THREAD_LIMIT,
  });

  // Global ⌘K / Ctrl+K trigger.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isK = event.key === 'k' || event.key === 'K';
      if (!isK) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.shiftKey || event.altKey) return;
      const target = event.target as Element | null;
      if (isFormElement(target)) return;
      event.preventDefault();
      setOpen(prev => !prev);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Reset query when closing so the next open starts clean.
  useEffect(() => {
    if (!open) setValue('');
  }, [open]);

  const settingsRoutes = useMemo<NavItem[]>(
    () => [
      settingsNavItem,
      ...userSettingsNavigation,
      ...artistSettingsNavigation,
    ],
    []
  );

  const adminRoutes = useMemo<NavItem[]>(
    () => (isAdmin ? [...adminNavigation, ...adminSettingsNavigation] : []),
    [isAdmin]
  );

  const runAndClose = useCallback((fn: () => void) => {
    fn();
    setOpen(false);
  }, []);

  const go = useCallback(
    (href: string) => {
      runAndClose(() => router.push(href));
    },
    [router, runAndClose]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className='overflow-hidden rounded-[18px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) p-0 shadow-popover sm:max-w-[560px]'
        hideClose
      >
        <DialogPrimitive.Title className='sr-only'>
          Command palette
        </DialogPrimitive.Title>
        <DialogPrimitive.Description className='sr-only'>
          Search routes, recent threads, and actions.
        </DialogPrimitive.Description>

        <Command className='flex flex-col' label='Command palette' shouldFilter>
          <div className='flex items-center gap-2.5 border-b border-(--linear-app-frame-seam) px-4 py-3'>
            <Search
              className='size-4 shrink-0 text-tertiary-token'
              aria-hidden='true'
            />
            <Command.Input
              autoFocus
              value={value}
              onValueChange={setValue}
              placeholder='Jump to a page, thread, or action…'
              className='flex-1 bg-transparent text-sm text-primary-token outline-none placeholder:text-tertiary-token'
            />
            <span className='hidden shrink-0 rounded-md border border-(--linear-app-frame-seam) bg-surface-1 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-tertiary-token sm:inline'>
              Esc
            </span>
          </div>

          <Command.List className='max-h-[360px] overflow-y-auto px-2 py-2'>
            <Command.Empty className='py-8 text-center text-sm text-secondary-token'>
              No matches.
            </Command.Empty>

            <Command.Group heading='Go to' className='cmdk-group'>
              {primaryNavigation.map(item => (
                <PaletteItem
                  key={`primary-${item.id}`}
                  value={`go ${item.name} ${item.href}`}
                  onSelect={() => go(item.href)}
                  icon={<NavItemIcon item={item} />}
                  label={item.name}
                  hint={item.description}
                />
              ))}
            </Command.Group>

            <Command.Group heading='Settings' className='cmdk-group'>
              {settingsRoutes.map(item => (
                <PaletteItem
                  key={`settings-${item.id}`}
                  value={`settings ${item.name} ${item.href}`}
                  onSelect={() => go(item.href)}
                  icon={<NavItemIcon item={item} />}
                  label={item.name}
                />
              ))}
            </Command.Group>

            {adminRoutes.length > 0 && (
              <Command.Group heading='Admin' className='cmdk-group'>
                {adminRoutes.map(item => (
                  <PaletteItem
                    key={`admin-${item.id}`}
                    value={`admin ${item.name} ${item.href}`}
                    onSelect={() => go(item.href)}
                    icon={<NavItemIcon item={item} />}
                    label={item.name}
                  />
                ))}
              </Command.Group>
            )}

            {conversations && conversations.length > 0 && (
              <Command.Group heading='Recent threads' className='cmdk-group'>
                {conversations.map(convo => {
                  const title = convo.title || 'Untitled thread';
                  return (
                    <PaletteItem
                      key={`thread-${convo.id}`}
                      value={`thread ${title} ${convo.id}`}
                      onSelect={() => go(`${APP_ROUTES.CHAT}/${convo.id}`)}
                      icon={
                        <MessageSquare
                          className='size-3.5 text-sidebar-item-icon'
                          aria-hidden='true'
                        />
                      }
                      label={title}
                    />
                  );
                })}
              </Command.Group>
            )}

            <Command.Group heading='Actions' className='cmdk-group'>
              <PaletteItem
                value='action new-thread new-chat'
                onSelect={() => go(APP_ROUTES.CHAT)}
                icon={
                  <SquarePen
                    className='size-3.5 text-sidebar-item-icon'
                    aria-hidden='true'
                  />
                }
                label='New thread'
              />
              {keyboardShortcuts && (
                <PaletteItem
                  value='action keyboard shortcuts help'
                  onSelect={() => runAndClose(() => keyboardShortcuts.open())}
                  icon={
                    <Keyboard
                      className='size-3.5 text-sidebar-item-icon'
                      aria-hidden='true'
                    />
                  }
                  label='Keyboard shortcuts'
                />
              )}
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function PaletteItem({
  value,
  onSelect,
  icon,
  label,
  hint,
}: {
  readonly value: string;
  readonly onSelect: () => void;
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly hint?: string;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className='flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-sm text-sidebar-item-foreground transition-colors data-[selected=true]:bg-sidebar-accent-active data-[selected=true]:text-sidebar-item-foreground'
    >
      <span className='flex size-5 shrink-0 items-center justify-center'>
        {icon}
      </span>
      <span className='flex-1 truncate text-[13px]'>{label}</span>
      {hint ? (
        <span className='ml-2 hidden truncate text-[11px] text-tertiary-token sm:inline'>
          {hint}
        </span>
      ) : null}
    </Command.Item>
  );
}
