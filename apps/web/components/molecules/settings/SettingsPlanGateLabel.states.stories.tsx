import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, waitFor, within } from 'storybook/test';
import {
  LocalCheckoutApi,
  UpgradeQueryProvider,
} from '@/tests/fixtures/upgrade-checkout-story';
import { SettingsPlanGateLabel } from './SettingsPlanGateLabel';

// Same local checkout stand-in as SettingsPlanGateLabel.stories.tsx: the
// story never reaches the real checkout endpoint.
const checkout: Decorator = function LocalCheckout(Story) {
  return (
    <UpgradeQueryProvider>
      <LocalCheckoutApi reply='server-error'>
        <Story />
      </LocalCheckoutApi>
    </UpgradeQueryProvider>
  );
};

const rtl: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

/** State coverage for the plan gate label; Default, CustomPlanName and WithFeatureContext live in SettingsPlanGateLabel.stories.tsx. */
const meta = {
  title: 'Molecules/Settings/SettingsPlanGateLabel States',
  component: SettingsPlanGateLabel,
  decorators: [checkout],
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/app' } },
    layout: 'centered',
  },
} satisfies Meta<typeof SettingsPlanGateLabel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Permission denied: a feature gated behind the paid plan offers the upgrade. */
export const GatedFeature: Story = {
  args: { featureContext: 'Custom domains' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const upgrade = canvas.getByRole('button', { name: /^Upgrade to / });
    // Direct-checkout pricing resolves async; the gate enables once it lands.
    await waitFor(() => expect(upgrade).toBeEnabled());
  },
};

/** Partial: no feature context, so the tooltip reads only the plan name. */
export const PartialNoFeatureContext: Story = {
  args: { planName: 'Elite' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('link', { name: 'Upgrade to Elite' })
    ).toBeInTheDocument();
  },
};

/** Long content: a long plan name and feature context. */
export const LongContentPlanName: Story = {
  args: {
    planName: 'Artist Presence Max with Label Services',
    featureContext: 'Double opt-in confirmation for every fan email list',
  },
};

/** Right-to-left: the gate inside an RTL settings page. */
export const RtlDocument: Story = {
  args: { planName: 'النخبة', featureContext: 'النطاقات المخصصة' },
  decorators: [rtl],
};
