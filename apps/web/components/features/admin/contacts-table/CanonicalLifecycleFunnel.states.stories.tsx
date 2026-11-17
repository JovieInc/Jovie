import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { CanonicalContactMetrics } from '@/lib/admin/contacts';
import { CanonicalLifecycleFunnel } from './CanonicalLifecycleFunnel';

const metrics: CanonicalContactMetrics = {
  total: 1234,
  suggested: 900,
  approved: 120,
  outreach: 80,
  profile_created: 50,
  certified: 30,
  signed_up: 20,
  claimed: 14,
  activated: 10,
  paying: 8,
  churned: 2,
};

/** State coverage for the canonical lifecycle funnel. */
const meta = {
  title: 'Admin/Growth/CanonicalLifecycleFunnel States',
  component: CanonicalLifecycleFunnel,
  parameters: { layout: 'padded' },
  args: { metrics },
} satisfies Meta<typeof CanonicalLifecycleFunnel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: eight-digit counts wrap the stage row without clipping. */
export const LongContentCounts: Story = {
  args: {
    metrics: Object.fromEntries(
      Object.keys(metrics).map((key, index) => [key, 98_765_432 - index * 1111])
    ) as unknown as CanonicalContactMetrics,
  },
};

/** Right-to-left: the funnel inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    function RtlDocumentDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
