import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';
import { TimeRangeSelector } from './TimeRangeSelector';

const analyticsRanges = ['1d', '7d', '30d', '90d'] as const;

const meta = {
  title: 'Molecules/TimeRangeSelector',
  component: TimeRangeSelector,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    value: '7d',
    onValueChange: fn(),
    ranges: analyticsRanges,
    variant: 'tabs',
    tabsBaseId: 'analytics-range',
    panelId: 'analytics-range-panel',
  },
  decorators: [
    Story => (
      <div className='w-96 max-w-full bg-surface-page p-4 text-primary-token'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TimeRangeSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

function AnalyticsTabsDemo() {
  const [value, setValue] = useState<(typeof analyticsRanges)[number]>('7d');

  return (
    <div className='grid gap-3'>
      <TimeRangeSelector
        value={value}
        onValueChange={setValue}
        ranges={analyticsRanges}
        variant='tabs'
        tabsBaseId='analytics-range'
        panelId='analytics-range-panel'
      />
      <div
        id='analytics-range-panel'
        role='tabpanel'
        aria-labelledby={`analytics-range-tab-${value}`}
        className='min-h-20 rounded-lg border border-subtle bg-surface-0 p-3 text-sm'
      >
        <p className='font-medium'>Audience trend</p>
        <p className='mt-1 text-secondary-token'>
          {value.toUpperCase()} window with streams, clicks, and saves.
        </p>
      </div>
    </div>
  );
}

export const AnalyticsTabs: Story = {
  render: () => <AnalyticsTabsDemo />,
};

export const RetentionDisabled: Story = {
  render: () => (
    <TimeRangeSelector
      value='7d'
      onValueChange={fn()}
      ranges={analyticsRanges}
      variant='tabs'
      tabsBaseId='analytics-retention'
      panelId='analytics-retention-panel'
      maxRetentionDays={30}
    />
  ),
};
