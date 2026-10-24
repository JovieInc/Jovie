import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { Button } from './button';
import { Checkbox } from './checkbox';
import { HoverReveal } from './hover-reveal';

const meta = {
  title: 'UI/Atoms/HoverReveal',
  component: HoverReveal,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof HoverReveal>;
export default meta;
type Story = StoryObj<typeof meta>;

function SelectionRow() {
  const [selected, setSelected] = useState(false);
  return (
    <div className='group flex w-64 items-center justify-between gap-2'>
      <span className='truncate text-app text-primary-token'>
        Midnight Echo
      </span>
      <div className='relative flex h-5 w-5 items-center justify-center'>
        <HoverReveal inverse engaged={selected} asChild>
          <span aria-hidden='true' className='tabular-nums'>
            1
          </span>
        </HoverReveal>
        <HoverReveal engaged={selected} asChild>
          <span className='absolute inset-0 flex items-center justify-center'>
            <Checkbox
              aria-label='Select Midnight Echo'
              checked={selected}
              onCheckedChange={value => setSelected(value === true)}
            />
          </span>
        </HoverReveal>
      </div>
    </div>
  );
}

export const Default: Story = {
  render: () => <SelectionRow />,
};

export const StateMatrix: Story = {
  render: () => (
    <div className='grid gap-4'>
      <SelectionRow />
      <div className='group flex w-64 items-center justify-between gap-2'>
        <span className='text-app text-primary-token'>ISRC</span>
        <HoverReveal engaged asChild>
          <Button
            size='sm'
            onClick={() => navigator.clipboard.writeText('USRC17607839')}
          >
            Copy ISRC
          </Button>
        </HoverReveal>
      </div>
      <div className='group flex w-64 items-center justify-between gap-2'>
        <span className='text-app text-primary-token'>Unavailable</span>
        <HoverReveal engaged asChild>
          <Button size='sm' disabled>
            Copy UPC
          </Button>
        </HoverReveal>
      </div>
    </div>
  ),
};
