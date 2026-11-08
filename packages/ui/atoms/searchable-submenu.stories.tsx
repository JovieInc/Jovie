import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import {
  SearchableList,
  SearchableSubmenu,
  type SearchableSubmenuItem,
} from './searchable-submenu';

const ITEMS: SearchableSubmenuItem[] = [
  { id: '1', label: 'Spotify', description: 'Connected', badge: '24' },
  { id: '2', label: 'Apple Music', description: 'Connected' },
  { id: '3', label: 'YouTube', description: 'Requires access', disabled: true },
  { id: '4', label: 'SoundCloud', description: 'Available' },
];

const meta: Meta = {
  title: 'UI/Atoms/SearchableSubmenu',
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj;

function ListDemo({ empty = false }: { readonly empty?: boolean }) {
  const [query, setQuery] = useState('');
  const items = empty
    ? []
    : ITEMS.filter(i => i.label.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className='w-72 rounded-(--system-b-radius-overlay) border border-default bg-surface-elevated p-1 shadow-popover'>
      <SearchableList
        items={items}
        query={query}
        onQueryChange={setQuery}
        onSelect={() => undefined}
        emptyMessage='No platforms match'
        placeholder='Filter platforms'
      />
    </div>
  );
}

export const Default: Story = { render: () => <ListDemo /> };
export const Empty: Story = { render: () => <ListDemo empty /> };

export const NestedMenu: Story = {
  render: () => (
    <DropdownMenuPrimitive.Root open>
      <DropdownMenuPrimitive.Trigger
        inert
        className='rounded-full border border-subtle bg-surface-1 px-3 py-2 text-sm text-primary-token'
      >
        Add platform
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content className='rounded-(--system-b-radius-overlay) border border-default bg-surface-elevated p-1 shadow-popover'>
          <SearchableSubmenu
            triggerLabel='Choose platform'
            sections={[
              { id: 'connected', label: 'Connected', items: ITEMS.slice(0, 2) },
              { id: 'available', label: 'Available', items: ITEMS.slice(2) },
            ]}
            onSelect={() => undefined}
          />
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  ),
};

export const LoadingNestedMenu: Story = {
  render: () => (
    <DropdownMenuPrimitive.Root open>
      <DropdownMenuPrimitive.Trigger
        inert
        className='rounded-full border border-subtle bg-surface-1 px-3 py-2 text-sm text-primary-token'
      >
        Add platform
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content className='rounded-(--system-b-radius-overlay) border border-default bg-surface-elevated p-1 shadow-popover'>
          <SearchableSubmenu
            triggerLabel='Choose platform'
            sections={[]}
            isLoading
            onSelect={() => undefined}
          />
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  ),
};

const LONG_ITEMS: SearchableSubmenuItem[] = [
  {
    id: 'long-1',
    label: 'Spotify for Artists — the main verified artist profile',
    description:
      'Connected through the label distribution account with weekly sync',
    badge: '1,284',
  },
  {
    id: 'long-2',
    label: 'Apple Music for Artists with the extended catalog of remixes',
    description: 'Connected, waiting for the next catalog refresh to finish',
  },
  {
    id: 'long-3',
    label: 'Bandcamp storefront for vinyl, cassettes and digital bundles',
    description: 'Available to connect from the distribution settings page',
  },
];

const RTL_ITEMS: SearchableSubmenuItem[] = [
  { id: 'rtl-1', label: 'سبوتيفاي', description: 'متصل', badge: '24' },
  {
    id: 'rtl-2',
    label: 'آبل ميوزك للفنانين مع الكتالوج الكامل للإصدارات',
    description: 'متصل عبر حساب التوزيع الخاص بشركة الإنتاج',
  },
  { id: 'rtl-3', label: 'يوتيوب', description: 'يتطلب صلاحية', disabled: true },
];

export const Partial: Story = {
  render: () => (
    <div className='w-72 rounded-(--system-b-radius-overlay) border border-default bg-surface-elevated p-1 shadow-popover'>
      <SearchableList
        items={[
          { id: 'p-1', label: 'Spotify' },
          { id: 'p-2', label: 'Apple Music' },
          { id: 'p-3', label: 'SoundCloud' },
        ]}
        onSelect={() => undefined}
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Only the required items and onSelect, with item descriptions, badges, icons, placeholder and empty copy omitted; the default search placeholder fills in.',
      },
    },
  },
};

export const LongContent: Story = {
  render: () => (
    <div className='w-72 rounded-(--system-b-radius-overlay) border border-default bg-surface-elevated p-1 shadow-popover'>
      <SearchableList
        items={LONG_ITEMS}
        onSelect={() => undefined}
        placeholder='Filter every connected and available platform'
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Long labels, descriptions and a long placeholder truncate inside a fixed-width list while badges stay visible.',
      },
    },
  },
};

export const Rtl: Story = {
  render: () => (
    <div
      dir='rtl'
      className='w-72 rounded-(--system-b-radius-overlay) border border-default bg-surface-elevated p-1 shadow-popover'
    >
      <SearchableList
        items={RTL_ITEMS}
        onSelect={() => undefined}
        placeholder='ابحث عن منصة'
        emptyMessage='لا توجد منصات مطابقة'
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Right-to-left Arabic labels and descriptions align to the start edge and truncate inside the list width; the search field keeps symmetric padding so text never runs under its icons.',
      },
    },
  },
};

export const PermissionDenied: Story = {
  render: () => (
    <div className='w-72 rounded-(--system-b-radius-overlay) border border-default bg-surface-elevated p-1 shadow-popover'>
      <SearchableList
        items={[
          { id: 'pd-1', label: 'Spotify', description: 'Connected' },
          {
            id: 'pd-2',
            label: 'YouTube Content ID',
            description: 'Requires label admin access',
            disabled: true,
          },
          {
            id: 'pd-3',
            label: 'Distributor payouts',
            description: 'Requires owner access',
            disabled: true,
          },
        ]}
        onSelect={() => undefined}
        placeholder='Filter platforms'
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Options the viewer lacks access to stay visible as disabled rows with the reason in the description; keyboard navigation skips them.',
      },
    },
  },
};
