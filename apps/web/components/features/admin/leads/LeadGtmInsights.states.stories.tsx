import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import type {
  LeadFunnelBreakdownRow,
  LeadFunnelReport,
} from '@/lib/leads/reporting-types';
import { LeadGtmInsightsView } from './LeadGtmInsights';

function row(cohort: string, scale: number): LeadFunnelBreakdownRow {
  return {
    cohort,
    scraped: 400 * scale,
    qualified: 220 * scale,
    approved: 140 * scale,
    contacted: 120 * scale,
    emailQueued: 90 * scale,
    dmSent: 30 * scale,
    claimClicks: 18 * scale,
    signups: 9 * scale,
    onboardingCompleted: 6 * scale,
    paidConversions: 2 * scale,
  };
}

const { cohort: _cohort, ...summary } = row('all', 2);

const report: LeadFunnelReport = {
  filters: {
    start: '2026-09-01T00:00:00.000Z',
    end: '2026-09-30T00:00:00.000Z',
  },
  summary,
  sourceBreakdown: [row('linktree', 1), row('beacons', 1)],
  musicToolBreakdown: [row('distrokid', 1), row('unknown', 1)],
  pixelBreakdown: [row('with pixels', 1), row('without pixels', 1)],
  verifiedBreakdown: [],
  paidTierBreakdown: [],
  keywordBreakdown: [],
  rampRecommendation: {
    recommendedAction: 'hold',
    recommendedNextDailyCap: 20,
    reasons: ['Claim-click rate is inside the target band.'],
    sampleSize: 240,
    claimClickRate: 0.15,
    providerFailureRate: 0.01,
  },
};

const emptyReport: LeadFunnelReport = {
  ...report,
  summary: {
    scraped: 0,
    qualified: 0,
    approved: 0,
    contacted: 0,
    emailQueued: 0,
    dmSent: 0,
    claimClicks: 0,
    signups: 0,
    onboardingCompleted: 0,
    paidConversions: 0,
  },
  sourceBreakdown: [],
  musicToolBreakdown: [],
  pixelBreakdown: [],
  rampRecommendation: {
    ...report.rampRecommendation,
    recommendedNextDailyCap: 10,
    reasons: ['Not enough sent leads to judge the ramp yet.'],
    sampleSize: 0,
    claimClickRate: null,
    providerFailureRate: null,
  },
};

function WidthDecorator(Story: () => ReactNode) {
  return (
    <div className='w-full max-w-5xl'>
      <Story />
    </div>
  );
}

const meta = {
  title: 'Features/Admin/Leads/LeadGtmInsights/States',
  component: LeadGtmInsightsView,
  parameters: { layout: 'centered' },
  decorators: [WidthDecorator],
} satisfies Meta<typeof LeadGtmInsightsView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no leads yet, every rate shows its placeholder and every list says so. */
export const EmptyNoLeads: Story = {
  args: { report: emptyReport },
};

/** Long content: long cohort names truncate and the ramp reasons wrap. */
export const LongContentCohorts: Story = {
  args: {
    report: {
      ...report,
      sourceBreakdown: [
        row('linktree-with-an-extremely-long-discovery-cohort-name', 3),
      ],
      musicToolBreakdown: [
        row('distrokid-and-a-second-distribution-tool-detected-together', 3),
      ],
      rampRecommendation: {
        ...report.rampRecommendation,
        reasons: [
          'Claim-click rate is inside the target band.',
          'Provider failures stayed under one percent across the whole window, so the daily cap can hold while more sends accumulate.',
        ],
      },
    },
  },
};

/** RTL: the cards and breakdown rows mirror in a right-to-left document. */
export const RtlLayout: Story = {
  args: { report },
  decorators: [
    function RtlDecorator(Story: () => ReactNode) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
