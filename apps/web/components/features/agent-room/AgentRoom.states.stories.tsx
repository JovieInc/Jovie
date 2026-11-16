import '@/app/globals.css';
import type { AgentRoomEvent } from '@jovie/agent-transport-contracts/agent-room';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AgentRoom } from './AgentRoom';
import { FLEET_ROOM_FIXTURE_EVENTS, fleetRoomFixtureView } from './fixtures';

/**
 * State coverage for the agent room. The canonical stories (fleet room, empty
 * room, unavailable activity, composer) stay in AgentRoom.stories.tsx; these
 * drive the same fixture view with different events or document direction.
 */
const meta = {
  title: 'Features/AgentRoom/AgentRoom States',
  component: AgentRoom,
  parameters: { layout: 'padded' },
  args: { view: fleetRoomFixtureView() },
} satisfies Meta<typeof AgentRoom>;

export default meta;
type Story = StoryObj<typeof meta>;

const [failure, ...rest] = FLEET_ROOM_FIXTURE_EVENTS;

/** Error: the store could not be read; the roster still renders. */
export const ErrorActivityUnreadable: Story = {
  args: {
    view: fleetRoomFixtureView([]),
    unavailableReason:
      'Activity could not be read just now. Refresh to retry; the roster still shows.',
  },
};

/** Error: an agent's last message is a failure, so it shows as blocked. */
export const ErrorFailedEvent: Story = {
  args: { view: fleetRoomFixtureView([failure]) },
};

/** Partial: a quiet day with a single message in the feed. */
export const PartialSingleEvent: Story = {
  args: { view: fleetRoomFixtureView(rest.slice(-1)) },
};

const longEvent: AgentRoomEvent = {
  ...rest[0],
  id: 'linear-comment:long-1',
  excerpt:
    'Route receipts as of 19:00Z, in full: the Linear mention to Codex is proven end to end, Lola to Duet is proven with a signed nonce, Linear to Duet is not wired yet and still needs the webhook secret rotated, and the mesh hub stays frozen until every acceptance check is green and separately recorded in the thread.',
  thread: {
    ...rest[0].thread,
    title:
      'Make Linear the one fleet bus, freeze the mesh hub, and record every route receipt in a single place agents can read',
  },
};

/** Long content: a long excerpt and thread title wrap inside the feed. */
export const LongContentExcerpt: Story = {
  args: { view: fleetRoomFixtureView([longEvent, ...rest]) },
};

/** Right-to-left: the room inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
