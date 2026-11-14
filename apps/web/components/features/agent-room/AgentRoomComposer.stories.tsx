import '@/app/globals.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  AgentRoomComposer,
  type AgentRoomComposerState,
} from './AgentRoomComposer';

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
    action: async (): Promise<AgentRoomComposerState> => ({
      status: 'sent',
      message: 'Posted in JOV-12296.',
    }),
  },
} satisfies Meta<typeof AgentRoomComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Composer: Story = {};

/** A failed send: the error shows and the typed message stays for a retry. */
export const FailedSend: Story = {
  args: {
    action: async (): Promise<AgentRoomComposerState> => ({
      status: 'error',
      message: 'Linear did not take the message. Try again.',
    }),
  },
};
