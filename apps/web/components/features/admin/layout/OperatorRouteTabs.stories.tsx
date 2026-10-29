import '@/app/globals.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ADMIN_WORKSPACE_TABS } from '@/constants/admin-navigation';
import { OperatorRouteTabs } from './OperatorRouteTabs';

const meta = {
  title: 'Features/Admin/Layout/OperatorRouteTabs',
  component: OperatorRouteTabs,
  parameters: {
    layout: 'padded',
    nextjs: { navigation: { pathname: '/app/ov/shipping' } },
  },
  args: { tabs: ADMIN_WORKSPACE_TABS.shipping, label: 'Shipping Views' },
} satisfies Meta<typeof OperatorRouteTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Shipping: Story = {};

export const CustomerReality: Story = {
  parameters: { nextjs: { navigation: { pathname: '/app/ov/product' } } },
};

export const Fleet: Story = {
  args: { tabs: ADMIN_WORKSPACE_TABS.operations, label: 'Fleet Views' },
  parameters: { nextjs: { navigation: { pathname: '/app/ov/system' } } },
};
