import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { DetectionCoverageSnapshot } from '@/lib/hud/detection-coverage';
import { HudDetectionCoveragePanel } from './HudDetectionCoveragePanel';

const base: DetectionCoverageSnapshot = {
  covered: 2,
  total: 4,
  blindSpots: [
    {
      capability: 'Checkout health',
      summary: 'No control case for a declined card.',
    },
  ],
  recentFounderRescues: [
    {
      id: 'JOV-7207',
      occurredAt: '2026-10-12T09:00:00.000Z',
      source: 'founder',
      summary: 'Founder caught a stalled deploy before the detector fired.',
    },
  ],
  founderRescueRate: 0.25,
  founderRescueRatePrevious: 0.4,
  founderRescueTrend: 'down',
  medianDetectionMinutes: 42,
  medianDetectionMinutesPrevious: 95,
  medianDetectionTrend: 'down',
  nextCapability: {
    id: 'checkout-health',
    title: 'Checkout health',
    score: 87,
    nextExpansion: 'Add a declined-card control case.',
  },
};

const meta = {
  title: 'Features/Admin/Hud/HudDetectionCoveragePanel States',
  component: HudDetectionCoveragePanel,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof HudDetectionCoveragePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no blind spots, no founder rescues and nothing left to verify. */
export const EmptyNoBlindSpotsOrRescues: Story = {
  args: {
    snapshot: {
      ...base,
      covered: 4,
      blindSpots: [],
      recentFounderRescues: [],
      nextCapability: null,
    },
  },
};

/** Long content: long capability titles, summaries and a multi-hour median. */
export const LongContentManyBlindSpots: Story = {
  args: {
    snapshot: {
      ...base,
      covered: 3,
      total: 128,
      medianDetectionMinutes: 1505,
      medianDetectionMinutesPrevious: 2890,
      nextCapability: {
        id: 'release-day-smart-link-routing',
        title:
          'Release-day smart link routing across every streaming service and storefront region',
        score: 1287,
        nextExpansion:
          'Add a deliberate red fixture for a region where the pre-save link resolves to a removed release, a control case for a healthy region, and a live firing against the production router before the next release window opens.',
      },
      blindSpots: Array.from({ length: 6 }, (_, index) => ({
        capability: `Catalog ingestion lane ${index + 1} for distributor deliveries`,
        summary:
          'The detector only watches the first delivery attempt, so a retry that silently drops artwork or credits is never flagged until an artist reports it.',
      })),
      recentFounderRescues: Array.from({ length: 6 }, (_, index) => ({
        id: `JOV-${7200 + index}`,
        occurredAt: '2026-10-12T09:00:00.000Z',
        source: 'founder',
        summary:
          'Founder noticed the release page showing yesterday’s links long before any automated check raised it, then traced it to a cache that never expired.',
      })),
    },
  },
};

function RtlPanel(args: { readonly snapshot?: DetectionCoverageSnapshot }) {
  return (
    <div dir='rtl' lang='ar'>
      <HudDetectionCoveragePanel {...args} />
    </div>
  );
}

/** RTL: Arabic capability and rescue copy in a right-to-left container. */
export const RtlArabicCoverage: Story = {
  args: {
    snapshot: {
      ...base,
      nextCapability: {
        id: 'checkout-health',
        title: 'سلامة صفحة الدفع',
        score: 87,
        nextExpansion: 'أضف حالة تحكم لبطاقة مرفوضة قبل نافذة الإصدار التالية.',
      },
      blindSpots: [
        {
          capability: 'استيراد الكتالوج',
          summary: 'لا يوجد اختبار يغطي إعادة المحاولة بعد فشل التسليم الأول.',
        },
      ],
      recentFounderRescues: [
        {
          id: 'JOV-7207',
          occurredAt: '2026-10-12T09:00:00.000Z',
          source: 'founder',
          summary: 'اكتشف المؤسس توقف النشر قبل أن ينطلق الكاشف.',
        },
      ],
    },
  },
  render: RtlPanel,
};
