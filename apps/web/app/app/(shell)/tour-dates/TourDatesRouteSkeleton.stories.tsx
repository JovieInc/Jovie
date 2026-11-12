import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TourDatesRouteSkeleton } from './TourDatesRouteSkeleton';

const meta = {
  title: 'App/Tour Dates/Route Skeleton',
  component: TourDatesRouteSkeleton,
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div className='relative flex h-160 w-full overflow-hidden bg-base'>
      <TourDatesRouteSkeleton />
    </div>
  ),
} satisfies Meta<typeof TourDatesRouteSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** First-boot fallback for /app/tour-dates inside the page's own frame. */
export const LoadingTourDates: Story = {};

/** On a phone the secondary toolbar action hides, as the loaded page does. */
export const LoadingNarrow: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
