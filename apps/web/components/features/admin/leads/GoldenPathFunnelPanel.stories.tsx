import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { buildGoldenPathReport } from '@/lib/acquisition/artist-offer-funnel';
import { GoldenPathFunnelPanel } from './GoldenPathFunnelPanel';

const meta = {
  title: 'Features/Admin/Leads/GoldenPathFunnelPanel',
  component: GoldenPathFunnelPanel,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof GoldenPathFunnelPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const at = (seconds: number) => new Date(Date.UTC(2026, 9, 20, 10, 0, seconds));

export const SmallCohort: Story = {
  args: {
    report: buildGoldenPathReport({
      totalVisits: 15,
      timelines: [
        { 'claim-link-open': at(0), start: at(5), claimed: at(65) },
        { start: at(0), 'sign-in': at(30), claimed: at(90) },
      ],
    }),
  },
};

export const Unavailable: Story = { args: { report: null } };
