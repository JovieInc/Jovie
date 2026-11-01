import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from './button';
import { CompositeField } from './composite-field';

const meta: Meta<typeof CompositeField> = {
  title: 'UI/Atoms/CompositeField',
  component: CompositeField,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const ClaimPill: Story = {
  render: () => (
    <CompositeField className='w-96' shape='pill' surface='page'>
      <span className='shrink-0 text-secondary-token'>jov.ie/</span>
      <input
        aria-label='Choose your handle'
        className='min-w-0 flex-1 bg-transparent text-primary-token'
        placeholder='you'
      />
      <Button size='sm' type='button'>
        Claim
      </Button>
    </CompositeField>
  ),
};

export const RoundedRect: Story = {
  render: () => (
    <CompositeField className='w-80' shape='md' size='sm' surface='shell'>
      <input
        aria-label='Search'
        className='min-w-0 flex-1 bg-transparent text-primary-token'
        placeholder='Search'
        type='search'
      />
    </CompositeField>
  ),
};
