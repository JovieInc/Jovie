import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import type { AdminSentryMetrics } from '@/lib/admin/sentry-metrics';
import { SentryMetricsCard } from './SentryMetricsCard';

const metrics: AdminSentryMetrics = {
  unresolvedIssues24h: 3,
  totalEvents24h: 128,
  impactedUsers24h: 14,
  criticalIssues24h: 0,
  topIssueTitle: 'TypeError: Cannot read property of undefined',
  topIssueShortId: 'JOVIE-42',
  isConfigured: true,
  isAvailable: true,
};

/** State coverage for the admin Sentry card; the default lives in SentryMetricsCard.stories.tsx. */
const meta = {
  title: 'Features/Admin/SentryMetricsCard States',
  component: SentryMetricsCard,
  parameters: { layout: 'padded' },
  args: { metrics },
} satisfies Meta<typeof SentryMetricsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: Sentry is configured but the read failed, so the card names the failure. */
export const ErrorSentryUnavailable: Story = {
  args: {
    metrics: {
      ...metrics,
      isAvailable: false,
      errorMessage: 'Sentry API returned 502. Metrics will refresh shortly.',
    },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(
        'Sentry API returned 502. Metrics will refresh shortly.'
      )
    ).toBeVisible();
  },
};

const LONG_ISSUE =
  'TypeError: Cannot read properties of undefined (reading "releaseCountdown") at ProfileReleaseHeader in apps/web/components/features/profile/ProfileReleaseHeader.tsx while hydrating a public profile';

/** Long content: large counts and a long top issue that truncates on one line. */
export const LongContentLargeCountsAndIssue: Story = {
  args: {
    metrics: {
      ...metrics,
      unresolvedIssues24h: 12_345,
      totalEvents24h: 9_876_543,
      impactedUsers24h: 1_234_567,
      criticalIssues24h: 4_321,
      topIssueTitle: LONG_ISSUE,
      topIssueShortId: 'JOVIE-123456',
    },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByTitle(`JOVIE-123456: ${LONG_ISSUE}`)
    ).toBeInTheDocument();
  },
};

/** Right-to-left: the card inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Unresolved Issues')
    ).toBeVisible();
  },
};
