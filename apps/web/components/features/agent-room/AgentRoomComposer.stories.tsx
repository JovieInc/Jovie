import '@/app/globals.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AgentRoomComposer } from './AgentRoomComposer';

const meta = {
  title: 'Features/AgentRoom/AgentRoomComposer',
  component: AgentRoomComposer,
  parameters: { layout: 'padded' },
  args: {
    agents: [
      { id: 'summer', name: 'Summer' },
      { id: 'elsa', name: 'Elsa' },
      { id: 'chloe', name: 'Chloe' },
      { id: 'lola', name: 'Lola' },
    ],
    action: async () => ({
      status: 'sent' as const,
      message: 'Posted in JOV-12296.',
    }),
  },
} satisfies Meta<typeof AgentRoomComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Composer: Story = {};
