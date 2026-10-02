import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SettingsPlanGateLabel } from './SettingsPlanGateLabel';

const meta = {
  title: 'Atoms/SettingsPlanGateLabel',
  component: SettingsPlanGateLabel,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof SettingsPlanGateLabel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomPlanName: Story = {
  args: {
    planName: 'Elite',
  },
};

export const WithFeatureContext: Story = {
  args: {
    featureContext: 'Custom domains',
  },
};
