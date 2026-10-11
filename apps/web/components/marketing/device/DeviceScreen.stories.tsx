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
