import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { AudienceQuickActionsCell } from './AudienceQuickActionsCell';

const meta = {
  title: 'Organisms/Table/Atoms/AudienceQuickActionsCell States',
  component: AudienceQuickActionsCell,
  args: { onExport: fn(), onBlock: fn() },
} satisfies Meta<typeof AudienceQuickActionsCell>;
export default meta;
type Story = StoryObj<typeof meta>;

export const RtlActions: Story = {
  decorators: [
    function Rtl(Story) {
      return (
        <div dir='rtl' className='group'>
          <Story />
        </div>
      );
    },
  ],
};
