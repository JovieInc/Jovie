import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  HudObservationStatus,
  type HudObservationStatusProps,
} from './HudObservationStatus';

function noop() {}

const meta = {
  title: 'Features/Admin/HudObservationStatus States',
  component: HudObservationStatus,
  parameters: { layout: 'centered' },
  args: {
    state: 'fresh',
    message: 'Shipping velocity refreshed from the last 24h of merged PRs.',
  },
} satisfies Meta<typeof HudObservationStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the first observation has not come back yet. */
export const LoadingFirstObservation: Story = {
  args: { state: 'loading', message: 'Reading shipping velocity.' },
};

/** Empty: a successful observation that found nothing. */
export const EmptyObservation: Story = {
  args: {
    state: 'empty',
    message: 'No PRs merged in the last 24h.',
    freshnessLabel: 'Updated 2m ago',
  },
};

/** Error: the source could not be reached, with Retry. */
export const ErrorUnavailableWithRetry: Story = {
  args: {
    state: 'unavailable',
    message: 'Could not reach the shipping-velocity data source.',
    onRetry: noop,
  },
};

/** Partial: no freshness label and no retry handler. */
export const PartialMessageOnly: Story = {
  args: { state: 'not_configured', message: 'Connect GitHub to see velocity.' },
};

/** Offline: last-known-good evidence kept while the network is down. */
export const OfflineStaleWithRetry: Story = {
  args: {
    state: 'stale',
    message: 'You appear to be offline. Showing the last known velocity.',
    freshnessLabel: 'Updated 4h ago',
    onRetry: noop,
  },
};

function NarrowStatus(args: HudObservationStatusProps) {
  return (
    <div className='w-72'>
      <HudObservationStatus {...args} />
    </div>
  );
}

/** Long content: a long message and freshness label in a narrow column. */
export const LongContentWrappingMessage: Story = {
  args: {
    state: 'stale',
    message:
      'The shipping-velocity source answered with a partial page after three retries, so the numbers below are the last complete observation and may trail the merge queue by several hours.',
    freshnessLabel: 'Last complete observation 14h 32m ago from GitHub',
    onRetry: noop,
  },
  render: NarrowStatus,
};

function RtlStatus(args: HudObservationStatusProps) {
  return (
    <div dir='rtl' lang='ar' className='w-72'>
      <HudObservationStatus {...args} />
    </div>
  );
}

/** RTL: Arabic message and freshness label, Retry mirrored to the left. */
export const RtlArabicMessage: Story = {
  args: {
    state: 'unavailable',
    message: 'تعذر الوصول إلى مصدر بيانات سرعة الشحن.',
    freshnessLabel: 'آخر تحديث قبل ٤ ساعات',
    onRetry: noop,
  },
  render: RtlStatus,
};
