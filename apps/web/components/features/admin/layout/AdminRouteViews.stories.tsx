import '@/app/globals.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AdminRouteViews } from './AdminRouteViews';

const meta = {
  title: 'Features/Admin/Layout/AdminRouteViews',
  component: AdminRouteViews,
  parameters: {
    layout: 'padded',
    nextjs: { navigation: { pathname: '/app/ov/shipping' } },
  },
  args: { group: 'shipping' },
} satisfies Meta<typeof AdminRouteViews>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pipeline: Story = {};

export const Product: Story = {
  parameters: { nextjs: { navigation: { pathname: '/app/ov/product' } } },
};

export const Fleet: Story = {
  args: { group: 'operations' },
  parameters: { nextjs: { navigation: { pathname: '/app/ov/system' } } },
};
