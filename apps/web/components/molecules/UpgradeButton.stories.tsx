import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import {
  LocalCheckoutApi,
  STORY_PRICE_ID,
  UpgradeQueryProvider,
} from '@/tests/fixtures/upgrade-checkout-story';
import { UpgradeButton } from './UpgradeButton';

const meta = {
  title: 'Molecules/UpgradeButton',
  component: UpgradeButton,
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/app' } },
    layout: 'centered',
  },
  decorators: [
    Story => (
      <UpgradeQueryProvider>
        <Story />
      </UpgradeQueryProvider>
    ),
  ],
  args: {
    variant: 'primary',
    size: 'md',
  },
} satisfies Meta<typeof UpgradeButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  decorators: [
    Story => (
      <LocalCheckoutApi reply='server-error'>
        <Story />
      </LocalCheckoutApi>
    ),
  ],
};

export const DefaultPriceCheckout: Story = {
  decorators: [
    Story => (
      <LocalCheckoutApi reply='pending'>
        <Story />
      </LocalCheckoutApi>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole('button', {
      name: 'Upgrade to Artist Presence',
    });
    await userEvent.click(button);
    await expect(
      await canvas.findByRole('button', { name: 'Loading...' })
    ).toBeDisabled();
  },
};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
  },
};

export const CustomLabel: Story = {
  args: {
    children: 'Go Pro',
  },
};

export const Small: Story = {
  args: {
    size: 'sm',
  },
};

export const LoadingCheckout: Story = {
  args: { priceId: STORY_PRICE_ID },
  decorators: [
    Story => (
      <LocalCheckoutApi reply='pending'>
        <Story />
      </LocalCheckoutApi>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button'));
    await expect(
      await canvas.findByRole('button', { name: 'Loading...' })
    ).toBeDisabled();
  },
};

export const ErrorCheckout: Story = {
  args: { priceId: STORY_PRICE_ID },
  decorators: [
    Story => (
      <LocalCheckoutApi reply='server-error'>
        <Story />
      </LocalCheckoutApi>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button'));
    await expect(
      await canvas.findByText(
        'Request failed due to a temporary server issue. Please try again.'
      )
    ).toBeInTheDocument();
    await expect(canvas.getByRole('button')).toBeEnabled();
  },
};

export const OfflineCheckout: Story = {
  args: { priceId: STORY_PRICE_ID },
  decorators: [
    Story => (
      <LocalCheckoutApi reply='offline'>
        <Story />
      </LocalCheckoutApi>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button'));
    await expect(
      await canvas.findByText('Network request failed')
    ).toBeInTheDocument();
    await expect(canvas.getByRole('button')).toBeEnabled();
  },
};

export const LongContentLabel: Story = {
  args: {
    children:
      'Upgrade to Artist Presence and unlock every fan notification channel',
  },
  render: args => (
    <div className='w-64'>
      <UpgradeButton {...args} />
    </div>
  ),
};

export const RtlLabel: Story = {
  args: {
    children: 'الترقية إلى الحضور الفني',
  },
  render: args => (
    <div dir='rtl' className='w-64'>
      <UpgradeButton {...args} />
    </div>
  ),
};

export const ComposedButton: Story = {
  args: {
    asChild: true,
    children: (
      <Button type='button' variant='secondary'>
        Upgrade to Artist Presence
      </Button>
    ),
  },
  decorators: [
    Story => (
      <LocalCheckoutApi reply='server-error'>
        <Story />
      </LocalCheckoutApi>
    ),
  ],
};
