import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { MobileWebScreen } from './DeviceScreen';

const preview = getMarketingExportImage('tim-white-profile-live-mobile');

const meta = {
  title: 'Marketing/Device/MobileWebScreen',
  component: MobileWebScreen,
  parameters: {
    layout: 'centered',
    jovie: {
      // This story exercises mobile web. OfficialIPhoneFrame has runtime
      // tests; its native screenshot story awaits a real native iOS capture.
      uncoveredProps: ['screenshot', 'sizes'],
    },
  },
  decorators: [
    Story => (
      <div className='w-71 bg-surface-0 p-4'>
        <Story />
      </div>
    ),
  ],
  args: {
    children: (
      <img
        src={preview.publicUrl}
        alt={preview.alt}
        className='h-full w-full object-cover object-top'
      />
    ),
  },
} satisfies Meta<typeof MobileWebScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PublicProfile: Story = {};

/** A sparse page fills only the top of the screen; the frame keeps its size. */
export const PartialSparsePage: Story = {
  args: {
    children: (
      <div className='p-4 text-sm text-primary-token'>
        <p className='font-medium'>Tim White</p>
        <p className='text-secondary-token'>One link so far</p>
      </div>
    ),
  },
};

/** A page taller than the screen is clipped by the fixed-ratio frame. */
export const LongContentScrollsPastScreen: Story = {
  args: {
    children: (
      <div className='space-y-3 p-4 text-sm text-primary-token'>
        {Array.from({ length: 30 }, (_, i) => `Release ${i + 1}`).map(label => (
          <p key={label}>
            {label}: a long title that wraps across the phone width
          </p>
        ))}
      </div>
    ),
  },
};

/** The screen inside a right-to-left page. */
export const RtlPage: Story = {
  args: {
    children: (
      <div className='p-4 text-sm text-primary-token'>
        <p className='font-medium'>Tim White</p>
        <p className='text-secondary-token'>Listen on every service</p>
      </div>
    ),
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
