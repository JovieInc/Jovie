import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { SearchableList, type SearchableSubmenuItem } from './searchable-submenu';

const ITEMS: SearchableSubmenuItem[] = [
  { id: '1', label: 'Spotify' },
  { id: '2', label: 'Apple Music' },
  { id: '3', label: 'YouTube', disabled: true },
  { id: '4', label: 'SoundCloud' },
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
    <div className='w-64 rounded-md border border-subtle bg-surface-1 p-2'>
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
