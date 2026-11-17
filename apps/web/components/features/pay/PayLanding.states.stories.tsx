import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PayLanding } from './PayLanding';

const meta = {
  title: 'Marketing/Routes/Pay States',
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

/** Rtl: the full pay landing page in a right-to-left document. */
export const Rtl: Story = {
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
