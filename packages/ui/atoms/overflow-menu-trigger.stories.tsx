import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OverflowMenuTrigger } from './overflow-menu-trigger';

const meta: Meta<typeof OverflowMenuTrigger> = {
  title: 'UI/Atoms/OverflowMenuTrigger',
  component: OverflowMenuTrigger,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { 'aria-label': 'More actions' },
};

export const ActiveOverflow: Story = {
  args: { 'aria-label': 'More actions', hasActiveOverflow: true },
};

export const MenuOpen: Story = {
  args: {
    'aria-label': 'More actions',
    'aria-expanded': true,
    hasActiveOverflow: true,
  },
};

export const Disabled: Story = {
  args: { 'aria-label': 'More actions', disabled: true },
};

export const VariantMatrix: Story = {
  render: () => (
    <div className='flex items-center gap-6'>
      <div className='flex flex-col items-center gap-2'>
        <OverflowMenuTrigger variant='drawer' aria-label='Drawer overflow' />
        <span className='text-xs text-tertiary-token'>Drawer</span>
      </div>
      <div className='flex flex-col items-center gap-2'>
        <OverflowMenuTrigger
          variant='segment'
          hasActiveOverflow
          aria-label='Segment overflow, current tab hidden'
        />
        <span className='text-xs text-tertiary-token'>Active segment</span>
      </div>
    </div>
  ),
};
