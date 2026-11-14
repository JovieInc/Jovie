import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CalendarRouteSkeleton } from './CalendarRouteSkeleton';

const meta = {
  title: 'App/Calendar/Route Skeleton',
  component: CalendarRouteSkeleton,
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div className='relative flex h-160 w-full overflow-hidden bg-base'>
      <CalendarRouteSkeleton />
    </div>
  ),
} satisfies Meta<typeof CalendarRouteSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** First-boot fallback for /app/calendar: filter rail beside a month grid. */
export const LoadingMonth: Story = {};

/** On a phone the filter rail folds into one scrolling row above the grid. */
export const LoadingNarrow: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

/** In a right-to-left document the rail and the weekday columns mirror. */
export const RtlMirrored: Story = {
  render: () => (
    <div
      dir='rtl'
      lang='ar'
      className='relative flex h-160 w-full overflow-hidden bg-base'
    >
      <CalendarRouteSkeleton />
    </div>
  ),
};
