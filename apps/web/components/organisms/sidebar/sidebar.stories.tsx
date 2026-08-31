import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Sidebar } from './sidebar';

const meta = {
  title: 'Organisms/Sidebar/sidebar',
  component: Sidebar,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
