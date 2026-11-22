import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { ScreenshotFilterBar } from './ScreenshotFilterBar';

function WidthDecorator(Story: () => ReactNode) {
  return (
    <div className='w-full max-w-5xl'>
      <Story />
    </div>
  );
}

const noop = () => undefined;

const meta = {
  title: 'Features/Admin/ScreenshotGallery/ScreenshotFilterBar',
  component: ScreenshotFilterBar,
  parameters: { layout: 'centered' },
  decorators: [WidthDecorator],
  args: {
    shown: 12,
    total: 24,
    canonical: 16,
    other: 8,
    surfaceFilter: 'all',
    groupFilter: 'all',
    consumerFilter: 'all',
    onSurfaceChange: noop,
    onGroupChange: noop,
    onConsumerChange: noop,
  },
} satisfies Meta<typeof ScreenshotFilterBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Empty: a set with no captures at all. */
export const EmptyCounts: Story = {
  args: { shown: 0, total: 0, canonical: 0, other: 0 },
};

/** Long content: counts in the thousands wrap beside the pills. */
export const LongContentCounts: Story = {
  args: { shown: 1200, total: 12_000, canonical: 9000, other: 3000 },
};

/** RTL: the counts and pills mirror in a right-to-left document. */
export const RtlFilters: Story = {
  args: { surfaceFilter: 'other' },
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
