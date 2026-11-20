import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HandleStatusIcon } from './HandleStatusIcon';

const meta = {
  title: 'Features/Home/HandleStatusIcon States',
  component: HandleStatusIcon,
  parameters: { layout: 'centered' },
  args: {
    handle: 'timwhite',
    showChecking: false,
    available: null,
    handleError: null,
    unavailable: false,
  },
} satisfies Meta<typeof HandleStatusIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: the handle failed validation, so the unavailable mark shows. */
export const ErrorInvalidHandle: Story = {
  args: {
    available: true,
    handleError: 'Handles can only use letters, numbers and underscores',
    unavailable: true,
  },
};

/** Rtl: the availability check in a right-to-left field. */
export const Rtl: Story = {
  args: { showChecking: true, handle: 'تيم' },
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
