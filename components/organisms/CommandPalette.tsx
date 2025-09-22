'use client';

import {
  BanknotesIcon,
  ChartPieIcon,
  Cog6ToothIcon,
  HomeIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { cn } from '@/lib/utils';

interface CommandItem {
  id: string;
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  href?: string;
  action?: () => void;
  category: 'navigation' | 'actions' | 'settings' | 'recent';
  keywords?: string[];
}

const COMMAND_ITEMS: CommandItem[] = [
  // Navigation
  {
    id: 'nav-overview',
    title: 'Overview',
    description: 'Dashboard overview and stats',
    icon: HomeIcon,
    href: '/dashboard/overview',
    category: 'navigation',
    keywords: ['dashboard', 'home', 'stats'],
  },
  {
    id: 'nav-links',
    title: 'Links',
    description: 'Manage your links and social media',
    icon: LinkIcon,
    href: '/dashboard/links',
    category: 'navigation',
    keywords: ['links', 'social', 'media', 'urls'],
  },
  {
    id: 'nav-analytics',
    title: 'Analytics',
    description: 'View your performance metrics',
    icon: ChartPieIcon,
    href: '/dashboard/analytics',
    category: 'navigation',
    keywords: ['analytics', 'metrics', 'performance', 'data'],
  },
  {
    id: 'nav-audience',
    title: 'Audience',
    description: 'Understand your audience',
    icon: UsersIcon,
    href: '/dashboard/audience',
    category: 'navigation',
    keywords: ['audience', 'users', 'followers', 'demographics'],
  },
  {
    id: 'nav-earnings',
    title: 'Earnings',
    description: 'Track your earnings and tips',
    icon: BanknotesIcon,
    href: '/dashboard/tipping',
    category: 'navigation',
    keywords: ['earnings', 'tips', 'money', 'revenue'],
  },
  {
    id: 'nav-settings',
    title: 'Settings',
    description: 'Manage your account and preferences',
    icon: Cog6ToothIcon,
    href: '/dashboard/settings',
    category: 'navigation',
    keywords: ['settings', 'preferences', 'account', 'configuration'],
  },
];

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const [search, setSearch] = React.useState('');

  // Close on navigation
  React.useEffect(() => {
    const handleRouteChange = () => {
      onOpenChange(false);
      setSearch('');
    };

    if (open) {
      window.addEventListener('beforeunload', handleRouteChange);
      return () =>
        window.removeEventListener('beforeunload', handleRouteChange);
    }
  }, [open, onOpenChange]);

  const handleSelect = React.useCallback(
    (item: CommandItem) => {
      if (item.href) {
        router.push(item.href);
      } else if (item.action) {
        item.action();
      }
      onOpenChange(false);
      setSearch('');
    },
    [router, onOpenChange]
  );

  const filteredItems = React.useMemo(() => {
    if (!search) return COMMAND_ITEMS;

    const searchLower = search.toLowerCase();
    return COMMAND_ITEMS.filter(item => {
      const matchesTitle = item.title.toLowerCase().includes(searchLower);
      const matchesDescription = item.description
        ?.toLowerCase()
        .includes(searchLower);
      const matchesKeywords = item.keywords?.some(keyword =>
        keyword.toLowerCase().includes(searchLower)
      );

      return matchesTitle || matchesDescription || matchesKeywords;
    });
  }, [search]);

  const groupedItems = React.useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    filteredItems.forEach(item => {
      if (!groups[item.category]) {
        groups[item.category] = [];
      }
      groups[item.category].push(item);
    });
    return groups;
  }, [filteredItems]);

  const categoryLabels: Record<string, string> = {
    navigation: 'Navigation',
    actions: 'Actions',
    settings: 'Settings',
    recent: 'Recent',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='overflow-hidden p-0 shadow-lg'>
        <div
          className={cn(
            'flex flex-col h-[400px] max-h-[80vh]',
            'bg-white dark:bg-gray-900',
            'border border-gray-200 dark:border-gray-700',
            'rounded-xl'
          )}
        >
          <Command shouldFilter={false} className='h-full'>
            <div className='flex items-center border-b border-gray-200 dark:border-gray-700 px-3'>
              <MagnifyingGlassIcon className='mr-2 h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400' />
              <Command.Input
                value={search}
                onValueChange={setSearch}
                placeholder='Search for pages, actions, or settings...'
                className={cn(
                  'flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none',
                  'placeholder:text-gray-500 dark:placeholder:text-gray-400',
                  'disabled:cursor-not-allowed disabled:opacity-50'
                )}
              />
              <kbd className='pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 px-1.5 font-mono text-[10px] font-medium text-gray-600 dark:text-gray-400 opacity-100'>
                ESC
              </kbd>
            </div>

            <Command.List className='max-h-[300px] overflow-y-auto p-1'>
              <Command.Empty className='py-6 text-center text-sm text-gray-500 dark:text-gray-400'>
                No results found for &quot;{search}&quot;
              </Command.Empty>

              {Object.entries(groupedItems).map(([category, items]) => (
                <Command.Group
                  key={category}
                  heading={categoryLabels[category]}
                  className='px-2 py-1.5'
                >
                  {items.map(item => {
                    const Icon = item.icon;
                    return (
                      <Command.Item
                        key={item.id}
                        value={item.id}
                        onSelect={() => handleSelect(item)}
                        className={cn(
                          'relative flex cursor-pointer select-none items-center rounded-lg px-3 py-2.5 text-sm outline-none',
                          'transition-colors duration-150',
                          'data-[selected]:bg-gray-100 dark:data-[selected]:bg-gray-800',
                          'hover:bg-gray-100 dark:hover:bg-gray-800'
                        )}
                      >
                        {Icon && (
                          <Icon className='mr-3 h-4 w-4 text-gray-500 dark:text-gray-400' />
                        )}
                        <div className='flex-1'>
                          <div className='font-medium text-gray-900 dark:text-gray-100'>
                            {item.title}
                          </div>
                          {item.description && (
                            <div className='text-xs text-gray-500 dark:text-gray-400 mt-0.5'>
                              {item.description}
                            </div>
                          )}
                        </div>
                        {item.href && (
                          <kbd className='pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 px-1.5 font-mono text-[10px] font-medium text-gray-600 dark:text-gray-400 opacity-60'>
                            ↵
                          </kbd>
                        )}
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              ))}
            </Command.List>

            <div className='border-t border-gray-200 dark:border-gray-700 p-2'>
              <div className='flex items-center justify-between text-xs text-gray-500 dark:text-gray-400'>
                <div className='flex items-center gap-1'>
                  <kbd className='inline-flex h-5 select-none items-center gap-1 rounded border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 px-1.5 font-mono text-[10px] font-medium'>
                    ↑↓
                  </kbd>
                  <span>Navigate</span>
                </div>
                <div className='flex items-center gap-1'>
                  <kbd className='inline-flex h-5 select-none items-center gap-1 rounded border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 px-1.5 font-mono text-[10px] font-medium'>
                    ↵
                  </kbd>
                  <span>Select</span>
                </div>
                <div className='flex items-center gap-1'>
                  <kbd className='inline-flex h-5 select-none items-center gap-1 rounded border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 px-1.5 font-mono text-[10px] font-medium'>
                    ESC
                  </kbd>
                  <span>Close</span>
                </div>
              </div>
            </div>
          </Command>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Hook for using command palette
export function useCommandPalette() {
  const [open, setOpen] = React.useState(false);

  // Register global keyboard shortcut
  useKeyboardShortcuts([
    {
      key: 'k',
      metaKey: true,
      action: () => setOpen(true),
      description: 'Open command palette',
    },
    {
      key: 'k',
      ctrlKey: true,
      action: () => setOpen(true),
      description: 'Open command palette',
    },
  ]);

  return {
    open,
    setOpen,
  };
}
