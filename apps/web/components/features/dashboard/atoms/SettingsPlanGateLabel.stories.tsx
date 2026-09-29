import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SettingsPlanGateLabel } from './SettingsPlanGateLabel';

const meta = {
  title: 'Dashboard/Atoms/SettingsPlanGateLabel',
  component: SettingsPlanGateLabel,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof SettingsPlanGateLabel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomDomainsContext: Story = {
  args: {
    featureContext: 'Custom domains',
    planName: 'Growth',
  },
};
