import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { TippingEmptyState } from './EmptyStates';

/** Rendered states of the tipping empty state card. */
const meta = {
  title: 'Tipping/EmptyStates/States',
  component: TippingEmptyState,
  parameters: { layout: 'centered' },
  args: { type: 'no-venmo', animate: false },
} satisfies Meta<typeof TippingEmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

const withRtlDocument: Decorator = function WithRtlDocument(Story) {
  return (
    <div dir='rtl' lang='ar' className='w-full max-w-md'>
      <Story />
    </div>
  );
};

/** Empty: no Venmo account is connected yet. */
export const EmptyNoVenmo: Story = {};

/** Right-to-left: the card in an Arabic document direction. */
export const RtlNoVenmo: Story = {
  decorators: [withRtlDocument],
};
