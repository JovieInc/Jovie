import '@/app/globals.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { AdminViewGroupId } from '@/constants/admin-navigation';
import { AdminRouteViews } from './AdminRouteViews';

const meta = {
  title: 'Features/Admin/Layout/AdminRouteViews States',
  component: AdminRouteViews,
  parameters: {
    layout: 'padded',
    nextjs: { navigation: { pathname: '/app/ov/room' } },
  },
  args: { group: 'operations' },
} satisfies Meta<typeof AdminRouteViews>;

export default meta;
type Story = StoryObj<typeof meta>;

type ViewsArgs = { readonly group: AdminViewGroupId };

function NarrowViews(args: ViewsArgs) {
  return (
    <div className='w-48 overflow-x-auto'>
      <AdminRouteViews {...args} />
    </div>
  );
}

/** Long content: the Fleet views in a column narrower than the control. */
export const LongContentNarrowColumn: Story = { render: NarrowViews };

function RtlViews(args: ViewsArgs) {
  return (
    <div dir='rtl' lang='ar'>
      <AdminRouteViews {...args} />
    </div>
  );
}

/** RTL: the segments run right to left with the active view kept. */
export const RtlSegments: Story = { render: RtlViews };
