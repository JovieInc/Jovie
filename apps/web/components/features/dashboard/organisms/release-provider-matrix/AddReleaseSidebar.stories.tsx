import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { AddReleaseSidebar } from './AddReleaseSidebar';

const meta = {
  title: 'Features/Dashboard/Releases/AddReleaseSidebar',
  component: AddReleaseSidebar,
  parameters: {
    jovie: {
      uncoveredProps: ['disabled'],
    },
  },
  args: {
    isOpen: true,
    artistName: 'Midnight Echo',
    onClose: fn(),
    onCreated: fn(),
  },
} satisfies Meta<typeof AddReleaseSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
