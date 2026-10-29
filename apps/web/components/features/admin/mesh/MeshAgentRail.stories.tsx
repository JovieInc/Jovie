import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { MeshAgentSnapshot } from '@/lib/ovie/mesh/types';
import { MeshAgentRail } from './MeshAgentRail';

const MESH_STORY_AGENT: MeshAgentSnapshot = {
  id: 'lola',
  label: 'Lola',
  receiveMode: 'direct',
  meshKind: 'lola',
  waitingOnTim: 'Rotation',
  status: 'stale',
  lastSentAt: '2026-10-20T12:00:00.000Z',
  lastReceivedAt: null,
  recentMessages: [
    {
      direction: 'sent',
      summary: 'Rotation ask forwarded',
      at: '2026-10-20T12:00:00.000Z',
    },
  ],
  gaps: ['Rotation approval pending'],
};

const meta = {
  title: 'Features/Admin/Mesh/MeshAgentRail',
  component: MeshAgentRail,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof MeshAgentRail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SelectedAgent: Story = {
  args: {
    agent: MESH_STORY_AGENT,
    isOpen: true,
    onClose: () => {},
    onPing: () => {},
    pingPending: false,
  },
};

export const SourceUnavailable: Story = {
  args: {
    agent: {
      ...MESH_STORY_AGENT,
      status: 'unknown',
      waitingOnTim: null,
      recentMessages: null,
      gaps: null,
      lastSentAt: null,
      lastReceivedAt: null,
    },
    isOpen: true,
    onClose: () => {},
    onPing: () => {},
    pingPending: false,
  },
};

export const NothingSelected: Story = {
  args: {
    agent: null,
    isOpen: false,
    onClose: () => {},
    onPing: () => {},
    pingPending: false,
  },
};
