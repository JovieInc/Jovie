import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { priceLockViewFixture } from '@/tests/fixtures/billing/price-lock';
import { PriceLockNote } from './PriceLockNote';

const meta = {
  title: 'Organisms/Billing/PriceLockNote',
  component: PriceLockNote,
  parameters: { layout: 'padded' },
  args: { lock: priceLockViewFixture() },
} satisfies Meta<typeof PriceLockNote>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Locked: Story = {};

/** No lock: nothing renders, so the claim is only ever shown when true. */
export const NoLock: Story = { args: { lock: null } };
