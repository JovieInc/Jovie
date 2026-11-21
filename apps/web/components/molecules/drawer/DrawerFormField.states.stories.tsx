import { Input } from '@jovie/ui';
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { DrawerFormField } from './DrawerFormField';

const CanvasFrame: Decorator = function CanvasFrame(Story) {
  return <div className='w-full max-w-sm'>{Story()}</div>;
};

const RtlFrame: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Molecules/Drawer/DrawerFormField States',
  component: DrawerFormField,
  parameters: {
    layout: 'centered',
  },
  decorators: [CanvasFrame],
  args: {
    label: 'Profile URL',
    htmlFor: 'profile-url-state',
    children: <Input id='profile-url-state' defaultValue='jov.ie/tim' />,
  },
} satisfies Meta<typeof DrawerFormField>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: a label and control with no helper line. */
export const PartialWithoutHelper: Story = {};

/** Long content: a long label and helper wrap above and below the control. */
export const LongContentLabelAndHelper: Story = {
  args: {
    label: 'Public profile URL that fans and press already share and bookmark',
    helperText:
      'Changing this URL breaks every link already shared on social posts, press kits and playlists, so keep the one fans already know unless you have a strong reason to move.',
  },
};

/** Right-to-left: Arabic label and helper inside an RTL drawer. */
export const RtlArabicField: Story = {
  args: {
    label: 'رابط الملف الشخصي',
    helperText: 'استخدم الرابط العام الذي يعرفه جمهورك.',
  },
  decorators: [RtlFrame],
};
