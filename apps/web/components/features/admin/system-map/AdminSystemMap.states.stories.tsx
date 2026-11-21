import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AdminSystemMap } from './AdminSystemMap';

const meta = {
  title: 'Features/Admin/System Map/AdminSystemMap/States',
  component: AdminSystemMap,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AdminSystemMap>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: the memory tab inside an RTL document. */
export const RtlMemoryTab: Story = {
  args: { activeTab: 'memory' },
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
