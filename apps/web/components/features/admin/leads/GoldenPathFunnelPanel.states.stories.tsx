import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  buildGoldenPathReport,
  type GoldenPathReport,
} from '@/lib/acquisition/artist-offer-funnel';
import { GoldenPathFunnelPanel } from './GoldenPathFunnelPanel';

const meta = {
  title: 'Features/Admin/Leads/GoldenPathFunnelPanel States',
  component: GoldenPathFunnelPanel,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof GoldenPathFunnelPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const NOW = new Date(Date.UTC(2026, 9, 20, 12, 0, 0));
const at = (seconds: number) => new Date(Date.UTC(2026, 9, 20, 10, 0, seconds));

/** Empty: no consented visits yet, so every rate has no base. */
export const EmptyNoVisits: Story = {
  args: {
    report: buildGoldenPathReport({ totalVisits: 0, timelines: [], now: NOW }),
  },
};

const busy = buildGoldenPathReport({
  totalVisits: 48213,
  now: NOW,
  timelines: Array.from({ length: 240 }, (_, index) => ({
    'claim-link-open': index % 2 === 0 ? at(0) : undefined,
    start: at(5 + (index % 40)),
    'sign-in': index % 3 === 0 ? at(90 + index) : undefined,
    claimed: index % 4 === 0 ? at(400 + index * 7) : undefined,
  })),
});

/** Long content: a large cohort, a stalled stage and several gaps. */
export const LongContentLargeCohort: Story = {
  args: {
    report: {
      ...busy,
      stalledStages: ['sign-in', 'upgrade-viewed', 'checkout', 'paid'],
      uninstrumented: [
        'identity-resolved',
        'profile-shared-with-first-fan',
        'first-release-page-published',
        'first-listener-notification-sent',
      ],
    },
  },
};

function RtlPanel(args: { readonly report: GoldenPathReport | null }) {
  return (
    <div dir='rtl' lang='ar'>
      <GoldenPathFunnelPanel {...args} />
    </div>
  );
}

/** RTL: the stage rows mirror in a right-to-left container. */
export const RtlFunnelRows: Story = {
  args: {
    report: buildGoldenPathReport({
      totalVisits: 15,
      now: NOW,
      timelines: [
        { 'claim-link-open': at(0), start: at(5), claimed: at(65) },
        { start: at(0), 'sign-in': at(30), claimed: at(90) },
      ],
    }),
  },
  render: RtlPanel,
};
