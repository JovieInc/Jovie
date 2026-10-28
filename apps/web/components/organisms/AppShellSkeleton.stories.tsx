import '../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AppShellSkeleton } from './AppShellSkeleton';

const meta = {
  title: 'Organisms/AppShellSkeleton',
  component: AppShellSkeleton,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof AppShellSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const OvBrand: Story = {
  args: {
    brandVariant: 'ov',
  },
};

export const CollapsedSidebar: Story = {
  args: {
    sidebarCollapsed: true,
  },
};

export const NoSidebar: Story = {
  args: {
    sidebar: null,
  },
};
