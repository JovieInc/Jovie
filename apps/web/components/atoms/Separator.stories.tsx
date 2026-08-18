import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Separator } from './Separator';

const meta = {
  title: 'Atoms/Separator',
  component: Separator,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: () => (
    <div className='w-64 space-y-3 text-sm text-secondary-token'>
      <span>Audience</span>
      <Separator />
      <span>Sources</span>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className='flex h-8 items-center gap-3 text-sm text-secondary-token'>
      <span>Details</span>
      <Separator orientation='vertical' />
      <span>Activity</span>
    </div>
  ),
};
