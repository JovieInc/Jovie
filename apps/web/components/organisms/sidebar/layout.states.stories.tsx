import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SidebarContent, SidebarHeader, SidebarInput } from './layout';

const meta = {
  title: 'Organisms/Sidebar/layout States',
  component: SidebarHeader,
} satisfies Meta<typeof SidebarHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const RtlLayout: Story = {
  render: function RtlSidebarLayout() {
    return (
      <div dir='rtl'>
        <SidebarHeader>
          <SidebarInput aria-label='بحث' />
        </SidebarHeader>
        <SidebarContent>المحتوى</SidebarContent>
      </div>
    );
  },
};
