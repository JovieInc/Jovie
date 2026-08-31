import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { WaitlistPublicLanding } from './WaitlistPublicLanding';

const meta = {
  title: 'Marketing/Routes/WaitlistPublicLanding',
  component: WaitlistPublicLanding,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/waitlist' },
    },
  },
} satisfies Meta<typeof WaitlistPublicLanding>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SplashB: Story = {};
