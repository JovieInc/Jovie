import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import snapshot from '@/lib/agent-distribution/generated/tools-list.snapshot.json';
import { LISTING } from '@/lib/agent-distribution/listing';
import { AgentConnectorDocs } from './AgentConnectorDocs';

const meta = {
  title: 'Features/Developers/AgentConnectorDocs',
  component: AgentConnectorDocs,
  parameters: { layout: 'fullscreen' },
  args: {
    listing: LISTING,
    toolsListHash: snapshot.toolsListHash,
    tools: snapshot.tools,
  },
} satisfies Meta<typeof AgentConnectorDocs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
