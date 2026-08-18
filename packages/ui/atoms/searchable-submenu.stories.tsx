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
    <DropdownMenuPrimitive.Root defaultOpen>
      <DropdownMenuPrimitive.Trigger className='rounded-full border border-subtle bg-surface-1 px-3 py-2 text-sm text-primary-token'>
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
    <DropdownMenuPrimitive.Root defaultOpen>
      <DropdownMenuPrimitive.Trigger className='rounded-full border border-subtle bg-surface-1 px-3 py-2 text-sm text-primary-token'>
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
