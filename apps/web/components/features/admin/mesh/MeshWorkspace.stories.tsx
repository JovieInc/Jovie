import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { MeshReadPayload } from '@/lib/ovie/mesh/types';
import { queryKeys } from '@/lib/queries/keys';
import { MeshWorkspace } from './MeshWorkspace';

const MESH_STORY_PAYLOAD: MeshReadPayload = {
  schema: 'jovie.mesh-read/v1',
  mailboxSource: 'ok',
  watcherSource: 'ok',
  agents: [
    {
      id: 'summer',
      label: 'Summer',
      receiveMode: 'direct',
      waitingOnTim: null,
      status: 'live',
      lastSentAt: '2026-10-23T18:00:00.000Z',
      lastReceivedAt: '2026-10-23T18:30:00.000Z',
      recentMessages: [
        {
          direction: 'received',
          summary: 'Daily brief delivered',
          at: '2026-10-23T18:30:00.000Z',
        },
      ],
      gaps: [],
    },
    {
      id: 'lola',
      label: 'Lola',
      receiveMode: 'direct',
      waitingOnTim: 'Rotation',
      status: 'stale',
      lastSentAt: null,
      lastReceivedAt: null,
      recentMessages: null,
      gaps: ['Rotation approval pending'],
    },
    {
      id: 'aeon',
      label: 'Aeon',
      receiveMode: 'relay',
      waitingOnTim: 'Grants',
      status: 'unknown',
      lastSentAt: null,
      lastReceivedAt: null,
      recentMessages: null,
      gaps: null,
    },
  ],
};

function withMeshCache(payload: MeshReadPayload) {
  return function MeshDecorator(Story: () => ReactNode) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    client.setQueryData(queryKeys.admin.mesh.read(), payload);
    return (
      <QueryClientProvider client={client}>
        <Story />
      </QueryClientProvider>
    );
  };
}

const meta = {
  title: 'Features/Admin/Mesh/MeshWorkspace',
  component: MeshWorkspace,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof MeshWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Roster: Story = {
  decorators: [withMeshCache(MESH_STORY_PAYLOAD)],
};

export const SourceUnavailable: Story = {
  decorators: [
    withMeshCache({
      ...MESH_STORY_PAYLOAD,
      mailboxSource: 'unavailable',
      watcherSource: 'unavailable',
      agents: MESH_STORY_PAYLOAD.agents.map(agent => ({
        ...agent,
        status: 'unknown',
        recentMessages: null,
        gaps: null,
        lastSentAt: null,
        lastReceivedAt: null,
      })),
    }),
  ],
};
