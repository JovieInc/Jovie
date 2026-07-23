import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Separator } from './separator';

const meta: Meta<typeof Separator> = {
  title: 'UI/Atoms/Separator',
  component: Separator,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: () => (
    <div className='w-48 space-y-2'>
      <div>Above</div>
      <Separator />
      <div>Below</div>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className='flex h-12 items-center gap-2'>
      <span>Left</span>
      <Separator orientation='vertical' />
      <span>Right</span>
    </div>
  ),
};
