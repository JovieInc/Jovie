import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import type { FleetAgentTableRow } from '@/lib/ovie/fleet-agents';
import { FleetAgentRail } from './FleetAgentRail';

const row: FleetAgentTableRow = {
  id: 'summer',
  fleetId: 'summer',
  role: 'Company governor',
  kind: 'agent',
  defaultDisplayName: 'Summer',
  status: 'degraded',
  readinessSummary: '3 gaps',
  readinessGaps: ['Gbrain', 'Company context', 'Registry'],
  presence: 'active',
};

const meta = {
  title: 'Features/Admin/FleetAgents/FleetAgentRail',
  component: FleetAgentRail,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <RightPanelProvider>
        <div className='flex h-screen justify-end bg-(--app-shell-content-canvas)'>
          <Story />
        </div>
      </RightPanelProvider>
    ),
  ],
} satisfies Meta<typeof FleetAgentRail>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Selected: Story = {
  args: {
    row,
    displayName: 'Summer',
    onDisplayNameChange: () => {},
    onClose: () => {},
  },
};

export const Empty: Story = {
  args: {
    row: null,
    displayName: '',
    onDisplayNameChange: () => {},
    onClose: () => {},
  },
};
