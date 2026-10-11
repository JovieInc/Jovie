import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';
import { PillSearch } from './PillSearch';
import type { FilterPill } from './pill-search.types';

const meta = {
  title: 'Shell/PillSearch',
  component: PillSearch,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='h-10 w-96 rounded-md border border-subtle bg-surface-0 px-2'>
        <Story />
      </div>
    ),
  ],
  args: {
    active: true,
    pills: [],
    onPillsChange: fn(),
    artistOptions: ['Example Artist', 'Second Artist'],
    titleOptions: ['Midnight Drive', 'Daylight'],
    albumOptions: ['Nocturne'],
    onClose: fn(),
  },
} satisfies Meta<typeof PillSearch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

const samplePills: FilterPill[] = [
  { id: 'p1', field: 'status', op: 'is', values: ['live'] },
];

export const WithPills: Story = {
  args: {
    pills: samplePills,
  },
};

function ControlledPillSearch() {
  const [pills, setPills] = useState<FilterPill[]>(samplePills);
  return (
    <PillSearch
      active
      pills={pills}
      onPillsChange={setPills}
      artistOptions={['Example Artist', 'Second Artist']}
      titleOptions={['Midnight Drive', 'Daylight']}
      albumOptions={['Nocturne']}
      onClose={() => {}}
    />
  );
}

export const Interactive: Story = {
  render: () => <ControlledPillSearch />,
};
