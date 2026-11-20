import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { StatusPipeline, type StatusPipelineStage } from './StatusPipeline';

// Synthetic display fixture; not a deployment or usage receipt.
const lifecycle: readonly StatusPipelineStage[] = [
  {
    id: 'desired',
    label: 'Desired',
    state: 'done',
    value: 'Registered',
    evidence: 'docs/FEATURE_REGISTRY.md',
  },
  {
    id: 'built',
    label: 'Built',
    state: 'done',
    value: 'Merged',
    evidence: 'docs/FEATURE_REGISTRY.md',
  },
  {
    id: 'certified',
    label: 'Certified',
    state: 'current',
    value: 'review ready',
    evidence: 'Certification ready',
  },
  {
    id: 'deployed',
    label: 'Deployed',
    state: 'done',
    value: '1.2.3 bbbbbbb',
    evidence: 'Deployed build (production)',
  },
  {
    id: 'exposed',
    label: 'Exposed',
    state: 'done',
    value: '128 in 7d',
    evidence: 'Public claimed profiles, 7-day window',
  },
  {
    id: 'observed',
    label: 'Observed',
    state: 'unknown',
    value: 'Not instrumented',
    evidence: 'Bot-filtered link taps, 7-day window',
  },
  {
    id: 'healthy',
    label: 'Healthy',
    state: 'pending',
    value: 'Configured, unobserved',
    evidence: 'Derived from the stages before it',
  },
];

const meta = {
  title: 'Molecules/StatusPipeline',
  component: StatusPipeline,
  parameters: { layout: 'padded' },
  args: { ariaLabel: 'Product Delivery Lifecycle', stages: lifecycle },
} satisfies Meta<typeof StatusPipeline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ProductLifecycle: Story = {};

export const ObservationFailure: Story = {
  args: {
    stages: lifecycle.map(stage =>
      stage.id === 'exposed'
        ? { ...stage, state: 'failed', value: 'Source error' }
        : stage
    ),
  },
};

export const Narrow: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
