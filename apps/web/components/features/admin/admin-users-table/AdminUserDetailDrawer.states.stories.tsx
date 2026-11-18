import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { AdminUserDetailDrawer } from './AdminUserDetailDrawer';
import { adminUser, longContentUser, rtlUser } from './adminUser.test-fixtures';

const withRailFrame: Decorator = function RailFrameDecorator(Story) {
  return (
    <div className='flex h-screen min-h-0 justify-end'>
      <Story />
    </div>
  );
};

const withRtlDirection: Decorator = function RtlDirectionDecorator(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

const meta = {
  title: 'Features/Admin/AdminUserDetailDrawer States',
  component: AdminUserDetailDrawer,
  decorators: [withRailFrame],
  args: {
    user: adminUser,
    onClose: fn(),
  },
} satisfies Meta<typeof AdminUserDetailDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long names, emails, ids and many links must clamp or truncate cleanly. */
export const LongContent: Story = {
  args: { user: longContentUser },
};

/** Right-to-left document with an Arabic user name and link label. */
export const Rtl: Story = {
  decorators: [withRtlDirection],
  args: { user: rtlUser },
};
