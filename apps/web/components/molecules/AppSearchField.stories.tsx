import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { AppSearchField } from './AppSearchField';

function SearchFieldStory() {
  const [value, setValue] = useState('');
  return (
    <div className='w-80 p-4'>
      <AppSearchField
        ariaLabel='Search library'
        value={value}
        onChange={setValue}
        onClear={() => setValue('')}
        onEscape={() => setValue('')}
      />
    </div>
  );
}

const meta = {
  title: 'Molecules/AppSearchField',
  component: SearchFieldStory,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof SearchFieldStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
