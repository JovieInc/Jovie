import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PayLanding } from './PayLanding';

const meta = {
  title: 'Marketing/Routes/Pay',
  component: PayLanding,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/pay' },
    },
  },
} satisfies Meta<typeof PayLanding>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PublicDefault: Story = {};
