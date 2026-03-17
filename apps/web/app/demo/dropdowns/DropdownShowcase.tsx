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

/**
 * Dropdown Parity Showcase — Linear.app Eval
 *
 * Renders all dropdown states as static HTML using the same CSS classes
 * the real Radix components use. Playwright reads computed styles against
 * the locked linear-dropdown-spec.json to verify pixel-perfect match.
 *
 * Route: /demo/dropdowns  (public, no auth)
 */

const SEARCHABLE_MENU_ITEMS = [
  { label: 'Profile', icon: <Star /> },
  { label: 'Settings', icon: <Settings /> },
  { label: 'Edit', icon: <Edit /> },
  { label: 'Duplicate', icon: <Copy /> },
  { label: 'Archive', icon: <Archive /> },
] as const;

function MenuSection({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className='mb-10'>
      <p className='mb-3 text-xs font-medium uppercase tracking-wider text-neutral-500'>
        {label}
      </p>
      {children}
    </div>
  );
}

export function DropdownShowcase() {
  return (
    <div
      className='min-h-screen p-12'
      style={{ backgroundColor: 'var(--linear-bg-page)' }}
    >
      <h1 className='mb-10 text-lg font-semibold text-neutral-700 dark:text-neutral-300'>
        Dropdown Parity — Linear.app Eval
      </h1>

      <div className='flex flex-wrap items-start gap-10'>
        {/* ── Normal + separator + destructive ─────────── */}
        <MenuSection label='Normal (separator + destructive)'>
          <div
            role='menu'
            data-testid='menu-normal'
            className={dropdownMenuContentClasses}
            style={{ position: 'static', transform: 'none', width: '220px' }}
          >
            <div
              role='menuitem'
              tabIndex={0}
              data-testid='item-normal'
              className={MENU_ITEM_BASE}
            >
              <Edit />
              Edit
            </div>
            <div
              role='menuitem'
              tabIndex={0}
              data-testid='item-normal'
              className={MENU_ITEM_BASE}
            >
              <Settings />
              Settings
            </div>
            <div
              role='menuitem'
              tabIndex={0}
              data-testid='item-normal'
              className={MENU_ITEM_BASE}
            >
              <Archive />
              Archive
            </div>
            <hr data-testid='menu-separator' className={MENU_SEPARATOR_BASE} />
            <div
              role='menuitem'
              tabIndex={0}
              data-testid='item-destructive'
              className={cn(MENU_ITEM_BASE, MENU_ITEM_DESTRUCTIVE)}
            >
              <Trash2 />
              Delete
            </div>
          </div>
        </MenuSection>

        {/* ── Destructive only ──────────────────────────── */}
        <MenuSection label='Destructive'>
          <div
            role='menu'
            data-testid='menu-destructive'
            className={dropdownMenuContentClasses}
            style={{ position: 'static', transform: 'none', width: '220px' }}
          >
            <div
              role='menuitem'
              tabIndex={0}
              data-testid='item-normal'
              className={MENU_ITEM_BASE}
            >
              <Copy />
              Duplicate
            </div>
            <hr data-testid='menu-separator' className={MENU_SEPARATOR_BASE} />
            <div
              role='menuitem'
              tabIndex={0}
              data-testid='item-destructive'
              className={cn(MENU_ITEM_BASE, MENU_ITEM_DESTRUCTIVE)}
            >
              <Trash2 />
              Delete permanently
            </div>
          </div>
        </MenuSection>

        {/* ── Disabled ─────────────────────────────────── */}
        <MenuSection label='Disabled items'>
          <div
            role='menu'
            data-testid='menu-disabled'
            className={dropdownMenuContentClasses}
            style={{ position: 'static', transform: 'none', width: '220px' }}
          >
            <div
              role='menuitem'
              tabIndex={0}
              data-testid='item-normal'
              className={MENU_ITEM_BASE}
            >
              <Edit />
              Edit
            </div>
            <div
              role='menuitem'
              tabIndex={-1}
              aria-disabled='true'
              data-disabled=''
              data-testid='item-disabled'
              className={MENU_ITEM_BASE}
            >
              <Settings />
              Settings (disabled)
            </div>
          </div>
        </MenuSection>

        {/* ── Keyboard shortcuts ────────────────────────── */}
        <MenuSection label='Keyboard shortcuts'>
          <div
            role='menu'
            data-testid='menu-shortcuts'
            className={dropdownMenuContentClasses}
            style={{ position: 'static', transform: 'none', width: '220px' }}
          >
            <div
              role='menuitem'
              tabIndex={0}
              data-testid='item-shortcut'
              className={MENU_ITEM_BASE}
            >
              <Edit />
              Edit
              <span className={cn(MENU_SHORTCUT_BASE, 'shortcut')}>⌘E</span>
            </div>
            <div
              role='menuitem'
              tabIndex={0}
              data-testid='item-shortcut'
              className={MENU_ITEM_BASE}
            >
              <Copy />
              Copy
              <span className={cn(MENU_SHORTCUT_BASE, 'shortcut')}>⌘C</span>
            </div>
            <div
              role='menuitem'
              tabIndex={0}
              data-testid='item-shortcut'
              className={MENU_ITEM_BASE}
            >
              <Archive />
              Archive
              <span className={cn(MENU_SHORTCUT_BASE, 'shortcut')}>⌘⇧A</span>
            </div>
          </div>
        </MenuSection>

        {/* ── Section labels ────────────────────────────── */}
        <MenuSection label='Section labels'>
          <div
            role='menu'
            data-testid='menu-labels'
            className={dropdownMenuContentClasses}
            style={{ position: 'static', transform: 'none', width: '220px' }}
          >
            <div
              role='none'
              data-testid='menu-label'
              className={MENU_LABEL_BASE}
            >
              Account
            </div>
            <div
              role='menuitem'
              tabIndex={0}
              data-testid='item-normal'
              className={MENU_ITEM_BASE}
            >
              <Star />
              Profile
            </div>
            <div
              role='menuitem'
              tabIndex={0}
              data-testid='item-normal'
              className={MENU_ITEM_BASE}
            >
              <Settings />
              Settings
            </div>
            <hr data-testid='menu-separator' className={MENU_SEPARATOR_BASE} />
            <div
              role='none'
              data-testid='menu-label'
              className={MENU_LABEL_BASE}
            >
              Workspace
            </div>
            <div
              role='menuitem'
              tabIndex={0}
              data-testid='item-normal'
              className={MENU_ITEM_BASE}
            >
              <Archive />
              Archive
            </div>
          </div>
        </MenuSection>

        {/* ── Compact ──────────────────────────────────── */}
        <MenuSection label='Compact'>
          <div
            role='menu'
            data-testid='menu-compact'
            className={dropdownMenuContentCompactClasses}
            style={{ position: 'static', transform: 'none', width: '220px' }}
          >
            <div
              role='menuitem'
              tabIndex={0}
              data-testid='item-normal'
              className={MENU_ITEM_COMPACT}
            >
              <Edit />
              Edit
            </div>
            <div
              role='menuitem'
              tabIndex={0}
              data-testid='item-normal'
              className={MENU_ITEM_COMPACT}
            >
              <Copy />
              Duplicate
            </div>
            <hr data-testid='menu-separator' className={MENU_SEPARATOR_BASE} />
            <div
              role='menuitem'
              tabIndex={0}
              data-testid='item-destructive'
              className={cn(MENU_ITEM_COMPACT, MENU_ITEM_DESTRUCTIVE)}
            >
              <Trash2 />
              Delete
            </div>
          </div>
        </MenuSection>

        {/* ── Submenu ───────────────────────────────────── */}
        <MenuSection label='Submenu'>
          <div className='flex items-start gap-1'>
            {/* Parent menu — submenu trigger highlighted */}
            <div
              role='menu'
              data-testid='menu-submenu'
              className={dropdownMenuContentClasses}
              style={{ position: 'static', transform: 'none', width: '220px' }}
            >
              <div
                role='menuitem'
                tabIndex={0}
                data-testid='item-normal'
                className={MENU_ITEM_BASE}
              >
                <Edit />
                Edit
                <span className={MENU_SHORTCUT_BASE}>⌘E</span>
              </div>
              <div
                role='menuitem'
                tabIndex={0}
                data-testid='item-normal'
                className={MENU_ITEM_BASE}
              >
                <Copy />
                Duplicate
                <span className={MENU_SHORTCUT_BASE}>⌘D</span>
              </div>
              <hr className={MENU_SEPARATOR_BASE} />
              {/* Sub trigger — active/open state */}
              <div
                role='menuitem'
                tabIndex={0}
                data-testid='item-subtrigger'
                className={cn(
                  MENU_ITEM_BASE,
                  'bg-surface-1 text-primary-token [&_svg]:text-primary-token'
                )}
              >
                <Settings />
                More options
                <ChevronRight className='ml-auto h-3.5 w-3.5 shrink-0' />
              </div>
            </div>
            {/* Sub content — positioned as if floating to the right */}
            <div
              role='menu'
              data-testid='menu-subcontent'
              className={dropdownMenuContentClasses}
              style={{
                position: 'static',
                transform: 'none',
                width: '180px',
                marginTop: '60px',
              }}
            >
              <div
                role='menuitem'
                tabIndex={0}
                data-testid='item-normal'
                className={MENU_ITEM_BASE}
              >
                <Archive />
                Archive
              </div>
              <div
                role='menuitem'
                tabIndex={0}
                data-testid='item-normal'
                className={MENU_ITEM_BASE}
              >
                <Star />
                Favourite
              </div>
              <hr className={MENU_SEPARATOR_BASE} />
              <div
                role='menuitem'
                tabIndex={0}
                data-testid='item-destructive'
                className={cn(MENU_ITEM_BASE, MENU_ITEM_DESTRUCTIVE)}
              >
                <Trash2 />
                Delete
              </div>
            </div>
          </div>
        </MenuSection>

        {/* ── Searchable ────────────────────────────────── */}
        <MenuSection label='Searchable'>
          <SearchableMenu />
        </MenuSection>
      </div>
    </div>
  );
}

function SearchableMenu() {
  const [query, setQuery] = React.useState('');

  const filtered = query.trim()
    ? SEARCHABLE_MENU_ITEMS.filter(i =>
        i.label.toLowerCase().includes(query.toLowerCase())
      )
    : SEARCHABLE_MENU_ITEMS;

  return (
    <div
      role='menu'
      data-testid='menu-searchable'
      className={dropdownMenuContentClasses}
      style={{ position: 'static', transform: 'none', width: '220px' }}
    >
      <div className='relative px-2 pb-1 pt-1'>
        <svg
          className='absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-tertiary-token'
          fill='none'
          viewBox='0 0 24 24'
          stroke='currentColor'
          strokeWidth={1.5}
          aria-hidden='true'
        >
          <circle cx='11' cy='11' r='8' />
          <path d='m21 21-4.35-4.35' />
        </svg>
        <input
          type='text'
          aria-label='Search menu items'
          placeholder='Search...'
          value={query}
          onChange={e => setQuery(e.target.value)}
          className='w-full rounded-md border-0 border-b border-subtle bg-transparent py-1.5 pl-8 pr-3 text-[13px] text-primary-token placeholder:text-tertiary-token focus-visible:outline-none focus-visible:ring-0'
        />
      </div>
      {filtered.length === 0 ? (
        <div className='py-6 text-center text-[13px] text-tertiary-token'>
          No results
        </div>
      ) : (
        filtered.map(item => (
          <div
            key={item.label}
            role='menuitem'
            tabIndex={0}
            data-testid='item-normal'
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
