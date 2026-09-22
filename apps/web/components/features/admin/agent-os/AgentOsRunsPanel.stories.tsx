import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AGENT_OS_ADMIN_FIXTURE_ARTIFACTS } from '@/lib/agent-os/fixtures';
import { AgentOsRunsPanel } from './AgentOsRunsPanel';

const meta: Meta<typeof AgentOsRunsPanel> = {
  title: 'Admin/AgentOs/RunsPanel',
  component: AgentOsRunsPanel,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    artifacts: AGENT_OS_ADMIN_FIXTURE_ARTIFACTS,
  },
};

export const Empty: Story = {
  args: {
    artifacts: [],
  },
};
