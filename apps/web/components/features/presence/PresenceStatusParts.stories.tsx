import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PresenceSignalList, PresenceStatusBadge } from './PresenceStatusParts';

const meta = {
  title: 'Presence/SharedStatus',
  component: PresenceStatusBadge,
  args: {
    status: {
      label: 'Unconfigured',
      tone: 'neutral',
      needsAttention: true,
      nextAction: 'Connect a source before measuring health.',
      sortPriority: 1,
    },
  },
} satisfies Meta<typeof PresenceStatusBadge>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Unconfigured: Story = {};
export const Signals: Story = {
  render: () => (
    <PresenceSignalList
      signals={[
        {
          kind: 'blocker',
          tone: 'error',
          label: 'Indexing failed',
          detail: 'Reconnect the indexing source.',
          sortOrder: 0,
        },
        {
          kind: 'state',
          tone: 'neutral',
          label: 'Not measured',
          detail: 'An unconfigured check is not healthy.',
          sortOrder: 1,
        },
      ]}
    />
  ),
};
