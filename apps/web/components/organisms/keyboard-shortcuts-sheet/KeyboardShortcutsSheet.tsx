'use client';

import {
  Button,
  Input,
  Kbd,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@jovie/ui';
import { ChevronLeft, Search, X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useKeyboardShortcuts } from '@/contexts/KeyboardShortcutsContext';
import {
  KEYBOARD_SHORTCUTS,
  type KeyboardShortcut,
  SHORTCUT_CATEGORY_LABELS,
  type ShortcutCategory,
} from '@/lib/keyboard-shortcuts';

/**
 * Render individual shortcut keys with proper styling
 */
function ShortcutKeys({ keys }: { keys: string }) {
  // Handle "G then D" style sequential shortcuts
  if (keys.includes(' then ')) {
    const [first, second] = keys.split(' then ');
    return (
      <div className='flex items-center gap-1.5'>
        <Kbd variant='default'>{first}</Kbd>
        <span className='text-xs text-(--linear-text-tertiary)'>then</span>
        <Kbd variant='default'>{second}</Kbd>
      </div>
    );
  }

  // Handle space-separated keys (like "⌘ K" or "⌥ ⇧ Q")
  // Create array of {key, id} to avoid using array index in React key
  const keyParts = keys
    .split(' ')
    .filter(Boolean)
    .map((keyPart, i) => ({ keyPart, id: `${keys}-${i}` }));
  return (
    <div className='flex items-center gap-1'>
      {keyParts.map(({ keyPart, id }) => (
        <Kbd key={id} variant='default'>
          {keyPart}
        </Kbd>
      ))}
    </div>
  );
}

/**
 * Individual shortcut item row
 */
function ShortcutItem({ shortcut }: { shortcut: KeyboardShortcut }) {
  const Icon = shortcut.icon;

  return (
    <div className='flex items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-(--linear-bg-surface-2)'>
      <div className='flex items-center gap-3 min-w-0'>
        {Icon && (
          <Icon
            className='h-4 w-4 shrink-0 text-(--linear-text-tertiary)'
            aria-hidden
          />
        )}
        <span className='truncate text-sm text-(--linear-text-primary)'>
          {shortcut.label}
        </span>
      </div>
      <ShortcutKeys keys={shortcut.keys} />
    </div>
  );
}

/**
 * Category section with label and items
 */
function ShortcutCategorySection({
  category,
  shortcuts,
}: {
  category: ShortcutCategory;
  shortcuts: KeyboardShortcut[];
}) {
  if (shortcuts.length === 0) return null;

  return (
    <div className='space-y-1'>
      <h3 className='px-3 py-2 text-xs font-medium uppercase tracking-wider text-(--linear-text-tertiary)'>
        {SHORTCUT_CATEGORY_LABELS[category]}
      </h3>
      <div className='space-y-0.5'>
        {shortcuts.map(shortcut => (
          <ShortcutItem key={shortcut.id} shortcut={shortcut} />
        ))}
      </div>
    </div>
  );
}

/**
 * Keyboard shortcuts sheet that slides in from the right
 * Opens with Cmd+/ and contains a filterable list of all shortcuts
 */
export function KeyboardShortcutsSheet() {
  const { isOpen, close } = useKeyboardShortcuts();
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter shortcuts based on search query
  const filteredShortcuts = useMemo(() => {
    if (!searchQuery.trim()) {
      return KEYBOARD_SHORTCUTS;
    }

    const query = searchQuery.toLowerCase();
    return KEYBOARD_SHORTCUTS.filter(
      shortcut =>
        shortcut.label.toLowerCase().includes(query) ||
        shortcut.keys.toLowerCase().includes(query) ||
        shortcut.description?.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  // Group filtered shortcuts by category
  const groupedShortcuts = useMemo(() => {
    const groups: Record<ShortcutCategory, KeyboardShortcut[]> = {
      general: [],
      navigation: [],
      actions: [],
    };

    for (const shortcut of filteredShortcuts) {
      groups[shortcut.category].push(shortcut);
    }

    return groups;
  }, [filteredShortcuts]);

  // Handle sheet open state change
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        close();
        setSearchQuery('');
      }
    },
    [close]
  );

  // Focus input when sheet opens
  const handleAnimationEnd = useCallback(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const hasResults = filteredShortcuts.length > 0;
  const categoryOrder: ShortcutCategory[] = [
    'general',
    'navigation',
    'actions',
  ];

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent
        side='right'
        className='top-1 right-1 bottom-1 h-auto w-full rounded-xl border border-(--linear-border-default) p-0 sm:max-w-md'
        hideClose
        onAnimationEnd={handleAnimationEnd}
      >
        {/* Header with back button and title */}
        <SheetHeader className='flex shrink-0 flex-row items-center gap-3 space-y-0 border-b border-(--linear-border-subtle) px-4 py-3'>
          <Button
            variant='ghost'
            size='icon'
            className='h-8 w-8 shrink-0'
            onClick={close}
            aria-label='Close keyboard shortcuts'
          >
            <ChevronLeft className='h-4 w-4' />
          </Button>
          <SheetTitle className='text-sm font-medium'>
            Keyboard Shortcuts
          </SheetTitle>
          <Button
            variant='ghost'
            size='icon'
            className='h-8 w-8 shrink-0 ml-auto'
            onClick={close}
            aria-label='Close'
          >
            <X className='h-4 w-4' />
          </Button>
        </SheetHeader>

        {/* Search input */}
        <div className='shrink-0 border-b border-(--linear-border-subtle) px-4 py-3'>
          <div className='relative'>
            <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--linear-text-tertiary)' />
            <Input
              ref={inputRef}
              type='text'
              placeholder='Search shortcuts'
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className='border-(--linear-border-default) bg-(--linear-bg-surface-2) pl-9'
              inputSize='sm'
            />
            {searchQuery && (
              <Button
                variant='ghost'
                size='icon'
                className='absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6'
                onClick={() => setSearchQuery('')}
                aria-label='Clear search'
              >
                <X className='h-3 w-3' />
              </Button>
            )}
          </div>
        </div>

        {/* Shortcuts list */}
        <div className='flex-1 overflow-y-auto px-2 py-3'>
          {hasResults ? (
            <div className='space-y-4'>
              {categoryOrder.map(category => (
                <ShortcutCategorySection
                  key={category}
                  category={category}
                  shortcuts={groupedShortcuts[category]}
                />
              ))}
            </div>
          ) : (
            <div className='flex flex-col items-center justify-center py-12 text-center'>
              <Search className='mb-3 h-8 w-8 text-(--linear-text-tertiary)' />
              <p className='text-sm text-(--linear-text-tertiary)'>
                No shortcuts found for &quot;{searchQuery}&quot;
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
