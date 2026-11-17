import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { House, Users } from 'lucide-react';
import { SidebarNavItem } from './SidebarNavItem';

const meta: Meta<typeof SidebarNavItem> = {
  title: 'Shell/SidebarNavItem/States',
  component: SidebarNavItem,
  parameters: { layout: 'centered' },
  decorators: [
    function SidebarRail(Story) {
      return (
        <div className='w-60 bg-sidebar p-3'>
          <Story />
        </div>
      );
    },
  ],
};

export default meta;
type Story = StoryObj<typeof SidebarNavItem>;

/** Partial: a visual-only row with no handler and no active state. */
export const PartialVisualOnly: Story = {
  args: {
    collapsed: false,
    nested: true,
    item: { label: 'Audience', icon: Users },
  },
};

/** Long content: a long label clips inside the row instead of wrapping. */
export const LongContentLabel: Story = {
  args: {
    collapsed: false,
    item: {
      label: 'Release planning for the summer single and every remix',
      icon: House,
      active: true,
    },
  },
};

/** RTL: the icon and label mirror inside a right-to-left rail. */
export const RtlActive: Story = {
  args: {
    collapsed: false,
    item: { label: 'الرئيسية', icon: House, active: true },
  },
  render: function RtlActiveRender(args) {
    return (
      <div dir='rtl'>
        <SidebarNavItem {...args} />
      </div>
    );
  },
};
