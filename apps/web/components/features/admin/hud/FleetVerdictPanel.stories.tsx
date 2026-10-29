import '@/app/globals.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { DeliveryLanes } from '@/lib/ovie/shipping-state/contract';
import { FleetVerdictPanelView } from './FleetVerdictPanel';

const lanes = {
  heldByReason: { 'needs-human-decision': 4, 'tim-hold': 2 },
  failedByReason: { 'harness-failed': 61 },
} as unknown as DeliveryLanes;

const meta = {
  title: 'Features/Admin/Hud/FleetVerdictPanel',
  component: FleetVerdictPanelView,
  parameters: { layout: 'centered' },
  args: {
    lanes,
    verdict: {
      level: 'degraded',
      headline:
        'Fleet degraded: Remediation alerts are not being acknowledged (57 failed delivery records)',
      reasons: [
        'Remediation alerts are not being acknowledged (57 failed delivery records)',
      ],
      capacity: '2 of 3 lanes running',
    },
  },
} satisfies Meta<typeof FleetVerdictPanelView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Degraded: Story = {};

export const Healthy: Story = {
  args: {
    lanes: null,
    verdict: {
      level: 'healthy',
      headline: 'Fleet healthy: 3 of 3 lanes running',
      reasons: [],
      capacity: '3 of 3 lanes running',
    },
  },
};

export const NotReporting: Story = {
  args: {
    verdict: {
      level: 'down',
      headline: 'Fleet not reporting: the lanes feed is stale',
      reasons: ['The lanes feed is stale'],
      capacity: '2 of 3 lanes running',
    },
  },
};

export const NotMeasured: Story = {
  args: {
    lanes: null,
    verdict: {
      level: 'unknown',
      headline: 'Fleet health not measured',
      reasons: [],
      capacity: null,
    },
  },
};
