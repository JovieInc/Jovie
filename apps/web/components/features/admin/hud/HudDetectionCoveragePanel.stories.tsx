import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  type DetectionCoverageSnapshot,
  getDetectionCoverageSnapshot,
} from '@/lib/hud/detection-coverage';
import { HudDetectionCoveragePanel } from './HudDetectionCoveragePanel';

const measuredSnapshot = getDetectionCoverageSnapshot();

const fullyVerifiedSnapshot = {
  ...measuredSnapshot,
  covered: measuredSnapshot.total,
  blindSpots: [],
  recentFounderRescues: [],
  nextCapability: null,
} satisfies DetectionCoverageSnapshot;

const awaitingMeasurementSnapshot = {
  ...measuredSnapshot,
  founderRescueRate: null,
  founderRescueRatePrevious: null,
  founderRescueTrend: 'unknown',
  medianDetectionMinutes: null,
  medianDetectionMinutesPrevious: null,
  medianDetectionTrend: 'unknown',
} satisfies DetectionCoverageSnapshot;

const meta = {
  title: 'Features/Admin/Hud/HudDetectionCoveragePanel',
  component: HudDetectionCoveragePanel,
  parameters: {
    layout: 'padded',
  },
  args: {
    snapshot: measuredSnapshot,
  },
} satisfies Meta<typeof HudDetectionCoveragePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MeasuredWithBlindSpots: Story = {};

export const FullyVerified: Story = {
  args: {
    snapshot: fullyVerifiedSnapshot,
  },
};

export const AwaitingMeasurement: Story = {
  args: {
    snapshot: awaitingMeasurementSnapshot,
  },
};
