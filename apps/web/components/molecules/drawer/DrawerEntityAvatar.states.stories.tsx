import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { DrawerEntityAvatar } from './DrawerEntityAvatar';

const RtlFrame: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Molecules/Drawer/DrawerEntityAvatar States',
  component: DrawerEntityAvatar,
  parameters: { layout: 'centered' },
  args: { name: 'Alex Rivera', src: null },
} satisfies Meta<typeof DrawerEntityAvatar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: only a name, so the avatar falls back to initials, unverified. */
export const PartialNameOnly: Story = {
  args: { src: undefined, verified: undefined },
};

/** Long content: a long multi-part name still renders two initials. */
export const LongContentName: Story = {
  args: {
    name: 'Alexandria Catalina Rivera-Montgomery de la Cruz',
    verified: true,
  },
};

/** Right-to-left: an Arabic name inside an RTL drawer. */
export const RtlArabicName: Story = {
  args: { name: 'عمرو دياب', verified: true },
  decorators: [RtlFrame],
};
