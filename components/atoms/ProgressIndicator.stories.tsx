import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ProgressIndicator } from './ProgressIndicator';

const steps = [
  { id: 'name', title: 'Name', estimatedTimeSeconds: 30 },
  { id: 'handle', title: 'Handle', estimatedTimeSeconds: 45 },
  { id: 'publish', title: 'Publish', estimatedTimeSeconds: 60 },
];

const meta: Meta<typeof ProgressIndicator> = {
  title: 'Atoms/ProgressIndicator',
  component: ProgressIndicator,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    steps,
    currentStep: 1,
    totalSteps: steps.length,
  },
};

export const NoEstimates: Story = {
  args: {
    steps,
    currentStep: 2,
    totalSteps: steps.length,
    showTimeEstimate: false,
  },
};
