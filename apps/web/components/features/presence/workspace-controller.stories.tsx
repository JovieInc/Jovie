import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PresenceWorkspaceBoundary } from './workspace-controller';

const meta = {
  title: 'Presence/SharedWorkspaceBoundary',
  component: PresenceWorkspaceBoundary,
  args: {
    scope: {
      actorId: 'qa-actor',
      workspaceId: 'qa-workspace',
      target: 'creator',
    },
    children: <input aria-label='Workspace draft' />,
  },
} satisfies Meta<typeof PresenceWorkspaceBoundary>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Creator: Story = {};
export const Company: Story = {
  args: { scope: { ...meta.args.scope, target: 'company' } },
};
