import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { DrawerAnalyticsSummaryMetric } from './DrawerAnalyticsSummaryCard';
import { DrawerAnalyticsSummaryCard } from './DrawerAnalyticsSummaryCard';

const metrics: DrawerAnalyticsSummaryMetric[] = [
  { id: 'views', label: 'Views', value: '12.4k', hint: '+8% vs last week' },
  { id: 'clicks', label: 'Clicks', value: '3,204', hint: '+2% vs last week' },
];

const meta = {
  title: 'Molecules/Drawer/DrawerAnalyticsSummaryCard',
  component: DrawerAnalyticsSummaryCard,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80 bg-surface-0'>
        <Story />
      </div>
    ),
  ],
  args: {
    metrics,
    state: 'ready',
  },
} satisfies Meta<typeof DrawerAnalyticsSummaryCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
  args: {
    state: 'loading',
  },
};

export const ErrorState: Story = {
  args: {
    state: 'error',
    errorMessage: 'Analytics unavailable right now.',
  },
};

export const Empty: Story = {
  args: {
    metrics: [],
    emptyMessage: 'No analytics for this range yet.',
  },
};

export const Dimmed: Story = {
  args: {
    dimmed: true,
  },
};

/** Ready, but only one metric has a hint yet. */
export const PartialHints: Story = {
  args: {
    metrics: [
      { id: 'views', label: 'Views', value: '12.4k', hint: '+8% vs last week' },
      { id: 'clicks', label: 'Clicks', value: '3,204' },
    ],
    stableLayout: true,
  },
};

export const LongContent: Story = {
  args: {
    metrics: [
      {
        id: 'views',
        label: 'Profile views from smart links and QR codes',
        value: '1,234,567',
        hint: '+128% vs the previous 28-day window across all territories',
      },
      {
        id: 'clicks',
        label: 'Outbound clicks to streaming services',
        value: '987,654',
        hint: 'Spotify, Apple Music, YouTube Music, Tidal and Deezer combined',
      },
    ],
  },
};

export const Rtl: Story = {
  args: {
    metrics: [
      {
        id: 'views',
        label: 'المشاهدات',
        value: '12.4k',
        hint: '+8% عن الأسبوع الماضي',
      },
      {
        id: 'clicks',
        label: 'النقرات',
        value: '3,204',
        hint: '+2% عن الأسبوع الماضي',
      },
    ],
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
