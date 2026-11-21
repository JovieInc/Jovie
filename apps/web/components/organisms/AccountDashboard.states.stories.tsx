import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AccountDashboard } from './AccountDashboard';

/** Rendered states of the account settings quick actions. */
const meta = {
  title: 'Organisms/AccountDashboard/States',
  component: AccountDashboard,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AccountDashboard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Right-to-left: the quick action cards in an Arabic document. */
export const RtlDocument: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' className='mx-auto max-w-5xl p-6'>
        <Story />
      </div>
    ),
  ],
};
