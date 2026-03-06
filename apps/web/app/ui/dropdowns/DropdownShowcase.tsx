'use client';

import {
  dropdownMenuContentClasses,
  dropdownMenuContentCompactClasses,
  MENU_ITEM_BASE,
  MENU_ITEM_COMPACT,
  MENU_ITEM_DESTRUCTIVE,
  MENU_LABEL_BASE,
  MENU_SEPARATOR_BASE,
  MENU_SHORTCUT_BASE,
} from '@jovie/ui';
import {
  Archive,
  ChevronRight,
  Copy,
  Edit,
  Settings,
  Star,
  Trash2,
} from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

function MenuSection({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className='mb-10'>
      <p
        className='mb-3 text-[11px] font-semibold uppercase tracking-wider text-(--linear-text-tertiary)'
      >
        {label}
      </p>
      {children}
    </div>
  );
}

export function DropdownShowcase() {
  return (
    <div>
      <h1 className='mb-1 text-lg font-semibold text-(--linear-text-primary)'>
        Dropdown Menu
      </h1>
      <p className='mb-8 text-[13px] text-(--linear-text-tertiary)'>
        Matches Linear.app — 8px radius, 4px item radius, font weight 450,
        near-white text in dark mode
      </p>

      <div className='flex flex-wrap items-start gap-10'>
        <MenuSection label='Normal (separator + destructive)'>
          <div
            role='menu'
            data-testid='menu-normal'
            className={dropdownMenuContentClasses}
            style={{ position: 'static', transform: 'none', width: '220px' }}
          >
            <div role='menuitem' tabIndex={0} className={MENU_ITEM_BASE}>
              <Edit />
              Edit
            </div>
            <div role='menuitem' tabIndex={0} className={MENU_ITEM_BASE}>
              <Settings />
              Settings
            </div>
            <div role='menuitem' tabIndex={0} className={MENU_ITEM_BASE}>
              <Archive />
              Archive
            </div>
            <hr className={MENU_SEPARATOR_BASE} />
            <div
              role='menuitem'
              tabIndex={0}
              className={cn(MENU_ITEM_BASE, MENU_ITEM_DESTRUCTIVE)}
            >
              <Trash2 />
              Delete
            </div>
          </div>
        </MenuSection>

        <MenuSection label='Disabled items'>
          <div
            role='menu'
            className={dropdownMenuContentClasses}
            style={{ position: 'static', transform: 'none', width: '220px' }}
          >
            <div role='menuitem' tabIndex={0} className={MENU_ITEM_BASE}>
              <Edit />
              Edit
            </div>
            <div
              role='menuitem'
              tabIndex={-1}
              aria-disabled='true'
              data-disabled=''
              className={MENU_ITEM_BASE}
            >
              <Settings />
              Settings (disabled)
            </div>
          </div>
        </MenuSection>

        <MenuSection label='Keyboard shortcuts'>
          <div
            role='menu'
            className={dropdownMenuContentClasses}
            style={{ position: 'static', transform: 'none', width: '220px' }}
          >
            <div role='menuitem' tabIndex={0} className={MENU_ITEM_BASE}>
              <Edit />
              Edit
              <span className={MENU_SHORTCUT_BASE}>⌘E</span>
            </div>
            <div role='menuitem' tabIndex={0} className={MENU_ITEM_BASE}>
              <Copy />
              Copy
              <span className={MENU_SHORTCUT_BASE}>⌘C</span>
            </div>
            <div role='menuitem' tabIndex={0} className={MENU_ITEM_BASE}>
              <Archive />
              Archive
              <span className={MENU_SHORTCUT_BASE}>⌘⇧A</span>
            </div>
          </div>
        </MenuSection>

        <MenuSection label='Section labels'>
          <div
            role='menu'
            className={dropdownMenuContentClasses}
            style={{ position: 'static', transform: 'none', width: '220px' }}
          >
            <div role='none' className={MENU_LABEL_BASE}>
              Account
            </div>
            <div role='menuitem' tabIndex={0} className={MENU_ITEM_BASE}>
              <Star />
              Profile
            </div>
            <div role='menuitem' tabIndex={0} className={MENU_ITEM_BASE}>
              <Settings />
              Settings
            </div>
            <hr className={MENU_SEPARATOR_BASE} />
            <div role='none' className={MENU_LABEL_BASE}>
              Workspace
            </div>
            <div role='menuitem' tabIndex={0} className={MENU_ITEM_BASE}>
              <Archive />
              Archive
            </div>
          </div>
        </MenuSection>

        <MenuSection label='Compact'>
          <div
            role='menu'
            className={dropdownMenuContentCompactClasses}
            style={{ position: 'static', transform: 'none', width: '220px' }}
          >
            <div role='menuitem' tabIndex={0} className={MENU_ITEM_COMPACT}>
              <Edit />
              Edit
            </div>
            <div role='menuitem' tabIndex={0} className={MENU_ITEM_COMPACT}>
              <Copy />
              Duplicate
            </div>
            <hr className={MENU_SEPARATOR_BASE} />
            <div
              role='menuitem'
              tabIndex={0}
              className={cn(MENU_ITEM_COMPACT, MENU_ITEM_DESTRUCTIVE)}
            >
              <Trash2 />
              Delete
            </div>
          </div>
        </MenuSection>

        <MenuSection label='Submenu'>
          <div className='flex items-start gap-1'>
            <div
              role='menu'
              className={dropdownMenuContentClasses}
              style={{ position: 'static', transform: 'none', width: '220px' }}
            >
              <div role='menuitem' tabIndex={0} className={MENU_ITEM_BASE}>
                <Edit />
                Edit
                <span className={MENU_SHORTCUT_BASE}>⌘E</span>
              </div>
              <div role='menuitem' tabIndex={0} className={MENU_ITEM_BASE}>
                <Copy />
                Duplicate
                <span className={MENU_SHORTCUT_BASE}>⌘D</span>
              </div>
              <hr className={MENU_SEPARATOR_BASE} />
              <div
                role='menuitem'
                tabIndex={0}
                className={cn(
                  MENU_ITEM_BASE,
                  'bg-(--linear-bg-surface-1) text-(--linear-text-primary) [&_svg]:text-(--linear-text-primary)'
                )}
              >
                <Settings />
                More options
                <ChevronRight className='ml-auto h-3.5 w-3.5 shrink-0' />
              </div>
            </div>
            <div
              role='menu'
              className={dropdownMenuContentClasses}
              style={{
                position: 'static',
                transform: 'none',
                width: '180px',
                marginTop: '60px',
              }}
            >
              <div role='menuitem' tabIndex={0} className={MENU_ITEM_BASE}>
                <Archive />
                Archive
              </div>
              <div role='menuitem' tabIndex={0} className={MENU_ITEM_BASE}>
                <Star />
                Favourite
              </div>
              <hr className={MENU_SEPARATOR_BASE} />
              <div
                role='menuitem'
                tabIndex={0}
                className={cn(MENU_ITEM_BASE, MENU_ITEM_DESTRUCTIVE)}
              >
                <Trash2 />
                Delete
              </div>
            </div>
          </div>
        </MenuSection>

        <MenuSection label='Searchable'>
          <SearchableMenu />
        </MenuSection>
      </div>
    </div>
  );
}

function SearchableMenu() {
  const [query, setQuery] = React.useState('');

  const allItems = [
    { label: 'Profile', icon: <Star /> },
    { label: 'Settings', icon: <Settings /> },
    { label: 'Edit', icon: <Edit /> },
    { label: 'Duplicate', icon: <Copy /> },
    { label: 'Archive', icon: <Archive /> },
  ];

  const filtered = query.trim()
    ? allItems.filter(i => i.label.toLowerCase().includes(query.toLowerCase()))
    : allItems;

  return (
    <div
      role='menu'
      className={dropdownMenuContentClasses}
      style={{ position: 'static', transform: 'none', width: '220px' }}
    >
      <div className='relative px-2 pb-1 pt-1'>
        <svg
          className='absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-(--linear-text-tertiary)'
          fill='none'
          viewBox='0 0 24 24'
          stroke='currentColor'
          strokeWidth={2}
          aria-hidden='true'
        >
          <circle cx='11' cy='11' r='8' />
          <path d='m21 21-4.35-4.35' />
        </svg>
        <input
          type='text'
          placeholder='Search...'
          value={query}
          onChange={e => setQuery(e.target.value)}
          className='w-full rounded-md border-0 border-b border-(--linear-border-subtle) bg-transparent py-1.5 pl-8 pr-3 text-[13px] text-(--linear-text-primary) placeholder:text-(--linear-text-tertiary) focus-visible:outline-none focus-visible:ring-0'
        />
      </div>
      {filtered.length === 0 ? (
        <div
          className='py-6 text-center text-[13px] text-(--linear-text-tertiary)'
        >
          No results
        </div>
      ) : (
        filtered.map(item => (
          <div
            key={item.label}
            role='menuitem'
            tabIndex={0}
            className={MENU_ITEM_BASE}
          >
            {item.icon}
            {item.label}
          </div>
        ))
      )}
    </div>
  );
}
