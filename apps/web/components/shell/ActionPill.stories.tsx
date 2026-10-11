import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Plus } from 'lucide-react';
import { fn } from 'storybook/test';
import { ActionPill } from './ActionPill';

const meta = {
  title: 'Shell/ActionPill',
  component: ActionPill,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='bg-base p-4'>
        <Story />
      </div>
    ),
  ],
  args: {
    label: 'New release',
    onClick: fn(),
  },
} satisfies Meta<typeof ActionPill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithIcon: Story = {
  args: {
    icon: Plus,
  },
};

export const Submit: Story = {
  args: {
    type: 'submit',
    label: 'Save',
  },
};
