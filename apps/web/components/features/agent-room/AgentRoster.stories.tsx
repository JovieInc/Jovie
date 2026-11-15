import '@/app/globals.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AgentRoster } from './AgentRoster';
import { fleetRoomFixtureView } from './fixtures';

const meta = {
  title: 'Features/AgentRoom/AgentRoster',
  component: AgentRoster,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof AgentRoster>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FleetRoster: Story = {
  args: { agents: fleetRoomFixtureView().agents },
};

export const EmptyRoster: Story = { args: { agents: [] } };
