import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ReleasePlanWizard } from './ReleasePlanWizard';

const meta = {
  title: 'Dashboard/Releases/ReleasePlanWizard',
  component: ReleasePlanWizard,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    open: true,
    releaseTitle: 'The Deep End',
    isGateLoading: false,
    canGenerateReleasePlans: true,
    isGeneratingReleasePlan: false,
    onClose: fn(),
    onSubmit: fn(),
  },
} satisfies Meta<typeof ReleasePlanWizard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const UntitledRelease: Story = {
  args: {
    releaseTitle: null,
  },
};

export const GateLoading: Story = {
  args: {
    isGateLoading: true,
  },
};

export const UpgradeRequired: Story = {
  args: {
    canGenerateReleasePlans: false,
  },
};

export const Generating: Story = {
  args: {
    isGeneratingReleasePlan: true,
  },
};
