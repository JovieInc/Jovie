import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { WorkspaceSelector } from './WorkspaceSelector';

const workspaces = [
  {
    id: 'customer',
    label: 'Jovie',
    href: '/app',
    brandVariant: 'jovie' as const,
  },
  {
    id: 'ov',
    label: 'OV',
    href: '/app/ov',
    brandVariant: 'ov' as const,
  },
  {
    id: 'support',
    label: 'Support',
    href: '/app/support',
    brandVariant: 'jovie' as const,
  },
] as const;

const meta: Meta<typeof WorkspaceSelector> = {
  title: 'Molecules/WorkspaceSelector',
  component: WorkspaceSelector,
  parameters: {
    layout: 'centered',
  },
  args: {
    currentWorkspaceId: 'customer',
    workspaces,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const OVActive: Story = {
  args: {
    currentWorkspaceId: 'ov',
  },
};
