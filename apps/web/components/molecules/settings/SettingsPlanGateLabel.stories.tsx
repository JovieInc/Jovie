import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  LocalCheckoutApi,
  UpgradeQueryProvider,
} from '@/tests/fixtures/upgrade-checkout-story';
import { SettingsPlanGateLabel } from './SettingsPlanGateLabel';

const meta = {
  title: 'Molecules/Settings/SettingsPlanGateLabel',
  component: SettingsPlanGateLabel,
  decorators: [
    Story => (
      <UpgradeQueryProvider>
        <LocalCheckoutApi reply='server-error'>
          <Story />
        </LocalCheckoutApi>
      </UpgradeQueryProvider>
    ),
  ],
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/app' } },
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
