import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AdminPage } from './AdminPage';

const meta = {
  title: 'Features/Admin/Layout/AdminPage',
  component: AdminPage,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof AdminPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
