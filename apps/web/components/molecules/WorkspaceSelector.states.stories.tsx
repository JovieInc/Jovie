import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { WorkspaceSelector } from './WorkspaceSelector';

function RailDecorator(Story: () => ReactNode) {
  return (
    <div className='w-40 bg-sidebar p-3'>
      <Story />
    </div>
  );
}

function RtlRailDecorator(Story: () => ReactNode) {
  return (
    <div dir='rtl' lang='ar' className='w-40 bg-sidebar p-3'>
      <Story />
    </div>
  );
}

const meta = {
  title: 'Molecules/WorkspaceSelector/States',
  component: WorkspaceSelector,
  parameters: { layout: 'centered' },
  decorators: [RailDecorator],
  args: {
    currentWorkspaceId: 'customer',
    workspaces: [
      {
        id: 'customer',
        label: 'Jovie',
        href: '/app',
        brandVariant: 'jovie',
      },
    ],
  },
} satisfies Meta<typeof WorkspaceSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no workspaces, so the selector renders nothing. */
export const EmptyNoWorkspaces: Story = {
  args: { workspaces: [] },
};

/** Long content: a workspace name wider than the rail truncates. */
export const LongContentWorkspaceName: Story = {
  args: {
    workspaces: [
      {
        id: 'customer',
        label: 'Midnight Orchestra Records and Publishing',
        href: '/app',
        brandVariant: 'jovie',
      },
    ],
  },
};

/** RTL: an Arabic workspace name in a right-to-left rail. */
export const RtlWorkspaceName: Story = {
  args: {
    workspaces: [
      { id: 'customer', label: 'جوفي', href: '/app', brandVariant: 'jovie' },
    ],
  },
  decorators: [RtlRailDecorator],
};
