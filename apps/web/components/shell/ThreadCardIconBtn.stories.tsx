import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ArrowDown } from 'lucide-react';
import { ThreadCardIconBtn } from './ThreadCardIconBtn';

const meta = {
  title: 'Shell/ThreadCardIconBtn',
  component: ThreadCardIconBtn,
  parameters: {
    layout: 'centered',
  },
  args: {
    label: 'Download',
    children: <ArrowDown className='h-3 w-3' strokeWidth={2.25} />,
  },
} satisfies Meta<typeof ThreadCardIconBtn>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onClick: () => {},
  },
};

export const WithoutHandler: Story = {};
