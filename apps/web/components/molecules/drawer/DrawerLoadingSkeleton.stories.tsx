import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DrawerLoadingSkeleton } from './DrawerLoadingSkeleton';

const meta = {
  title: 'Molecules/Drawer/DrawerLoadingSkeleton',
  component: DrawerLoadingSkeleton,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof DrawerLoadingSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithoutTabs: Story = {
  args: {
    showTabs: false,
  },
};

export const FewerContentRows: Story = {
  args: {
    contentRows: 2,
  },
};
