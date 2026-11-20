import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { DrawerActionRow } from './DrawerActionRow';

const RtlDecorator: Decorator = Story => (
  <div dir='rtl' lang='ar'>
    <Story />
  </div>
);

const meta = {
  title: 'Molecules/Drawer/DrawerActionRow/States',
  component: DrawerActionRow,
  args: { label: 'Open public profile' },
} satisfies Meta<typeof DrawerActionRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PartialTextOnly: Story = {};
export const LongContent: Story = {
  args: {
    label: 'Open the public profile and review all available release details',
  },
};
export const Rtl: Story = {
  args: { label: 'افتح الملف الشخصي' },
  decorators: [RtlDecorator],
};
