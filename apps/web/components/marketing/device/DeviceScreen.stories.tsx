import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  MobileWebScreen,
  type NativeIosScreenshot,
  OfficialIPhoneFrame,
} from './DeviceScreen';

const NATIVE_CAPTURE: NativeIosScreenshot = {
  platform: 'ios-native',
  src: '/product-screenshots/tim-white-profile-listen-phone.png',
  alt: 'Jovie for iOS profile screen',
  width: 780,
  height: 1688,
};

const meta = {
  title: 'Marketing/Device/DeviceScreen',
  component: MobileWebScreen,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='bg-base w-[320px] p-8 text-primary-token'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MobileWebScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MobileWeb: Story = {
  render: () => (
    <MobileWebScreen testId='story-mobile-web-screen'>
      <div className='flex aspect-[402/874] items-center justify-center bg-surface-0 text-sm text-secondary-token'>
        Mobile web capture
      </div>
    </MobileWebScreen>
  ),
};

export const OfficialIphone: Story = {
  render: () => (
    <OfficialIPhoneFrame
      screenshot={NATIVE_CAPTURE}
      sizes='320px'
      className='w-full'
    />
  ),
};
