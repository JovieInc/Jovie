import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DrawerInlineNote } from './DrawerInlineNote';

const meta = {
  title: 'Molecules/Drawer/DrawerInlineNote',
  component: DrawerInlineNote,
  parameters: {
    layout: 'centered',
  },
  args: {
    message: 'No links added yet.',
  },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DrawerInlineNote>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ErrorTone: Story = {
  args: {
    tone: 'error',
    message: 'Failed to load links.',
  },
};
