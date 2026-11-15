import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { DrawerBackButton } from './DrawerBackButton';

const RtlFrame: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Molecules/Drawer/DrawerBackButton States',
  component: DrawerBackButton,
  parameters: {
    layout: 'centered',
  },
  args: {
    label: 'Back to artist',
    onClick: fn(),
  },
} satisfies Meta<typeof DrawerBackButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: an Arabic label inside an RTL drawer. */
export const RtlArabicLabel: Story = {
  args: {
    label: 'العودة إلى الفنان',
  },
  decorators: [RtlFrame],
};
