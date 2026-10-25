import '@/app/globals.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { emptyDeliverySummary } from '@/lib/ovie/shipping-state/contract';
import { OvieInFlightColumn } from './OvieInFlightColumn';

const meta = {
  title: 'Features/Admin/Hud/OvieInFlightColumn',
  component: OvieInFlightColumn,
  parameters: { layout: 'padded' },
  args: { delivery: emptyDeliverySummary(), rows: [], status: 'ready' },
} satisfies Meta<typeof OvieInFlightColumn>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unknown: Story = {};
export const Loading: Story = { args: { status: 'loading' } };
export const Unavailable: Story = { args: { status: 'error' } };
