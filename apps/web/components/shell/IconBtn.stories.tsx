import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Mic2 } from 'lucide-react';
import { IconBtn } from './IconBtn';

const meta = {
  title: 'Shell/IconBtn',
  component: IconBtn,
  parameters: {
    layout: 'centered',
  },
  args: {
    label: 'Lyrics',
    children: <Mic2 className='h-4 w-4' />,
  },
} satisfies Meta<typeof IconBtn>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const GhostActive: Story = {
  args: {
    tone: 'ghost',
    active: true,
  },
};
