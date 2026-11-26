import '@/app/globals.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AgentRoster } from './AgentRoster';
import { fleetRoomFixtureView } from './fixtures';

const [first, ...others] = fleetRoomFixtureView().agents;

const meta = {
  title: 'Features/AgentRoom/AgentRoster/States',
  component: AgentRoster,
  parameters: { layout: 'padded' },
  args: { agents: [first, ...others] },
} satisfies Meta<typeof AgentRoster>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a long name, role and blocked excerpt truncate in the row. */
export const LongContentBlockedAgent: Story = {
  args: {
    agents: [
      {
        ...first,
        name: 'An agent with an extremely long display name that must truncate',
        role: 'A platform role description that runs well past the row width',
        presence: 'blocked',
        lastExcerpt:
          'Blocked while waiting on a review that has not arrived for several days, with a long excerpt that clamps to two lines in the roster row.',
      },
    ],
  },
  decorators: [
    function NarrowFrame(Story) {
      return (
        <div className='w-80'>
          <Story />
        </div>
      );
    },
  ],
};

/** Rtl: the roster inside a right-to-left container. */
export const RtlRoster: Story = {
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
