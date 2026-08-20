import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';

import { SearchableContent } from './common-dropdown-renderer';

const meta = {
  title: 'UI/Atoms/CommonDropdown/Search',
  component: SearchableContent,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['isLoading'] },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SearchableContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    const [query, setQuery] = useState('');
    return (
      <div className='w-64 rounded-(--system-b-radius-overlay) border border-default bg-surface-elevated p-1 shadow-popover'>
        <SearchableContent
          query={query}
          placeholder='Search actions'
          onQueryChange={setQuery}
          onClear={() => setQuery('')}
        />
      </div>
    );
  },
};
