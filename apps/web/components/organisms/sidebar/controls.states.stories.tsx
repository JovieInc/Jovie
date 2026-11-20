import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SidebarProvider } from './context';
import { SidebarRail, SidebarTrigger } from './controls';

const meta = {
  title: 'Organisms/Sidebar/controls States',
  component: SidebarTrigger,
  decorators: [
    function SidebarFrame(Story) {
      return (
        <SidebarProvider>
          <Story />
        </SidebarProvider>
      );
    },
  ],
} satisfies Meta<typeof SidebarTrigger>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ClosedRail: Story = {
  render: function ClosedRail() {
    return <SidebarRail />;
  },
  decorators: [
    function ClosedSidebar(Story) {
      return (
        <SidebarProvider defaultOpen={false}>
          <Story />
        </SidebarProvider>
      );
    },
  ],
};
export const LongContentLabel: Story = {
  args: {
    'aria-label': 'Toggle the navigation sidebar and return to your workspace',
  },
};
export const RtlControls: Story = {
  decorators: [
    function Rtl(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
