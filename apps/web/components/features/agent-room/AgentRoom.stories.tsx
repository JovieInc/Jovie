import '@/app/globals.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AgentRoom } from './AgentRoom';
import { AgentRoomComposer } from './AgentRoomComposer';
import { fleetRoomFixtureView } from './fixtures';

const meta = {
  title: 'Features/AgentRoom/AgentRoom',
  component: AgentRoom,
  parameters: { layout: 'padded' },
  args: { view: fleetRoomFixtureView() },
} satisfies Meta<typeof AgentRoom>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FleetRoom: Story = {};

export const EmptyRoom: Story = { args: { view: fleetRoomFixtureView([]) } };

export const ActivityUnavailable: Story = {
  args: {
    view: fleetRoomFixtureView([]),
    unavailableReason:
      'Activity could not be read just now. Refresh to retry; the roster still shows.',
  },
};

export const WithComposer: Story = {
  args: {
    composer: (
      <AgentRoomComposer
        agents={[
          { id: 'summer', name: 'Summer' },
          { id: 'chloe', name: 'Chloe' },
        ]}
        action={async () => ({ status: 'idle' })}
      />
    ),
  },
};
