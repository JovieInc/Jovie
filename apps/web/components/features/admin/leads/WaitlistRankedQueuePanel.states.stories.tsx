import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { RankedQueue } from '@/lib/waitlist/ranked-queue';
import { WaitlistRankedQueuePanel } from './WaitlistRankedQueuePanel';

const meta = {
  title: 'Features/Admin/Leads/WaitlistRankedQueuePanel States',
  component: WaitlistRankedQueuePanel,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof WaitlistRankedQueuePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const capacity = { dailyLimit: 10, usedToday: 4, autoAcceptEnabled: true };

const row: RankedQueue['rows'][number] = {
  entryId: 'a',
  artistName: 'Mid Artist',
  status: 'waitlisted',
  waitlistedAt: '2026-10-25T10:00:00.000Z',
  score: 61.4,
  components: { identity: 30, audience: 19.4, catalog: 0, intent: 12 },
  unmeasured: ['catalog'],
  followers: 3200,
  holdReason: 'hold_capacity_full',
};

/** Empty: the queue was read and nobody is waiting. */
export const EmptyNobodyWaiting: Story = {
  args: { queue: { capacity, rows: [] } },
};

const HOLDS = [
  'hold_capacity_full',
  'hold_outranked',
  'hold_golden_path_not_green',
  'hold_open_learnings',
  'hold_support_load',
  'hold_high_profile_needs_verification',
  'hold_identity_unresolved',
  'hold_reach_unknown',
];

/** Long content: forty rows with long artist names and every hold reason. */
export const LongContentManyRows: Story = {
  args: {
    queue: {
      capacity: { dailyLimit: 250, usedToday: 250, autoAcceptEnabled: true },
      rows: Array.from({ length: 40 }, (_, index) => ({
        ...row,
        entryId: `row-${index}`,
        artistName: `The Midnight Collective Featuring The Northern Lights Orchestra And Friends ${index + 1}`,
        score: 99.9 - index * 1.7,
        unmeasured: ['catalog', 'audience', 'intent'],
        holdReason: HOLDS[index % HOLDS.length],
      })),
    },
  },
};

function RtlPanel(args: { readonly queue: RankedQueue | null }) {
  return (
    <div dir='rtl' lang='ar'>
      <WaitlistRankedQueuePanel {...args} />
    </div>
  );
}

/** RTL: Arabic artist names in a right-to-left container. */
export const RtlArabicArtists: Story = {
  args: {
    queue: {
      capacity,
      rows: [
        { ...row, artistName: 'فرقة منتصف الليل' },
        {
          ...row,
          entryId: 'b',
          artistName: 'أوركسترا الأضواء الشمالية',
          score: null,
          components: null,
          unmeasured: [],
          holdReason: null,
        },
      ],
    },
  },
  render: RtlPanel,
};
