import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InlineNotificationsFlowSkeleton } from './InlineNotificationsFlowSkeleton';

const meta: Meta<typeof InlineNotificationsFlowSkeleton> = {
  title: 'Profile/InlineNotificationsFlowSkeleton',
  component: InlineNotificationsFlowSkeleton,
  parameters: {
    layout: 'centered',
  },
};

export default meta;

/** Holds the inline email step's footprint while the form loads. */
export const Loading: StoryObj<typeof InlineNotificationsFlowSkeleton> = {
  render: () => (
    <div className='w-96 bg-base'>
      <InlineNotificationsFlowSkeleton />
    </div>
  ),
};

/** Right-to-left pages keep the same reserved footprint. */
export const Rtl: StoryObj<typeof InlineNotificationsFlowSkeleton> = {
  render: () => (
    <div dir='rtl' className='w-96 bg-base'>
      <InlineNotificationsFlowSkeleton />
    </div>
  ),
};
