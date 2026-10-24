import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  type DetectionCoverageSnapshot,
  getDetectionCoverageSnapshot,
} from '@/lib/hud/detection-coverage';
import { HudDetectionCoveragePanel } from './HudDetectionCoveragePanel';

const fullyVerified: DetectionCoverageSnapshot = {
  covered: 4,
  total: 4,
  blindSpots: [],
  recentFounderRescues: [],
  founderRescueRate: 0,
  founderRescueRatePrevious: 0,
  founderRescueTrend: 'flat',
  medianDetectionMinutes: 12,
  medianDetectionMinutesPrevious: 12,
  medianDetectionTrend: 'flat',
  nextCapability: null,
};
const unmeasured: DetectionCoverageSnapshot = {
  covered: 0,
  total: 4,
  blindSpots: [],
  recentFounderRescues: [],
  founderRescueRate: null,
  founderRescueRatePrevious: null,
  founderRescueTrend: 'unknown',
  medianDetectionMinutes: null,
  medianDetectionMinutesPrevious: null,
  medianDetectionTrend: 'unknown',
  nextCapability: null,
};
const meta = {
  title: 'Features/Admin/Hud/HudDetectionCoveragePanel',
  component: HudDetectionCoveragePanel,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof HudDetectionCoveragePanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Measured: Story = {
  args: { snapshot: getDetectionCoverageSnapshot() },
};
export const FullyVerified: Story = {
  args: { snapshot: fullyVerified },
};
export const Unmeasured: Story = {
  args: { snapshot: unmeasured },
};
