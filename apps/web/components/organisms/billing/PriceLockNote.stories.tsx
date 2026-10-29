import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { buildPriceLockView } from '@/lib/billing/price-lock-view';
import { PriceLockNote } from './PriceLockNote';

const lock = buildPriceLockView({
  plan: 'pro',
  priceVersionId: 'pro-2026-10-20-m12',
  currency: 'usd',
  monthlyAmountCents: 1200,
  yearlyAmountCents: null,
  stripePriceIdMonthly: 'price_12',
  stripePriceIdYearly: null,
  source: 'signup',
  lockedAt: '2026-10-29T00:00:00.000Z',
});

const meta = {
  title: 'Organisms/Billing/PriceLockNote',
  component: PriceLockNote,
  parameters: { layout: 'padded' },
  args: { lock },
} satisfies Meta<typeof PriceLockNote>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Locked: Story = {};

/** No lock: nothing renders, so the claim is only ever shown when true. */
export const NoLock: Story = { args: { lock: null } };
