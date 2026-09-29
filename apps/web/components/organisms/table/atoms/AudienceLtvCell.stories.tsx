import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AudienceLtvCell } from './AudienceLtvCell';

const meta = {
  title: 'Organisms/Table/Atoms/AudienceLtvCell',
  component: AudienceLtvCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    tipAmountTotalCents: 4500,
    tipCount: 3,
    visits: 8,
    engagementScore: 72,
    streamingClicks: 40,
    tipClickValueCents: 4500,
    merchSalesCents: 2000,
    ticketSalesCents: 0,
  },
} satisfies Meta<typeof AudienceLtvCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HighValue: Story = {};

export const NoValue: Story = {
  args: {
    tipAmountTotalCents: 0,
    tipCount: 0,
    visits: 1,
    engagementScore: 0,
    streamingClicks: 0,
    tipClickValueCents: 0,
    merchSalesCents: 0,
    ticketSalesCents: 0,
  },
};
