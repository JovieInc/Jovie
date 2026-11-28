import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import { fleetAgentRowsFromRoster } from '@/lib/ovie/fleet-agents';
import { OvieFleetAgentsWorkspace } from './OvieFleetAgentsWorkspace';

const rows = fleetAgentRowsFromRoster();

const meta = {
  title: 'Features/Admin/FleetAgents/OvieFleetAgentsWorkspace',
  component: OvieFleetAgentsWorkspace,
  parameters: {
    layout: 'fullscreen',
    nextjs: { navigation: { pathname: '/app/ov/agents' } },
  },
  decorators: [
    Story => (
      <RightPanelProvider>
        <div className='flex h-screen min-h-0 flex-col bg-(--app-shell-content-canvas)'>
          <Story />
        </div>
      </RightPanelProvider>
    ),
  ],
} satisfies Meta<typeof OvieFleetAgentsWorkspace>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { rows },
};
