import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent, within } from 'storybook/test';
import { ChatMerchActionCard } from './ChatMerchActionCard';

const meta = {
  title: 'Jovie/Components/ChatMerchActionCard',
  component: ChatMerchActionCard,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['disabled'],
    },
  },
} satisfies Meta<typeof ChatMerchActionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Publish: Story = {
  args: {
    profileId: 'profile-story',
    merchCardId: 'merch-story-publish',
    action: 'publish',
    title: 'Story Tour Tee',
    currentStatus: 'draft',
    retailPrice: '$32.00',
  },
};

export const Pause: Story = {
  args: {
    profileId: 'profile-story',
    merchCardId: 'merch-story-pause',
    action: 'pause',
    title: 'Story Tour Tee',
    currentStatus: 'live',
    retailPrice: '$32.00',
  },
};

/** Error: confirming fails in Storybook (no API), so the card shows its retry message. */
export const ErrorConfirmFails: Story = {
  args: Publish.args,
  play: async ({ canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole('button', { name: 'Publish' })
    );
  },
};

/** Long content: a very long product title wraps inside the card. */
export const LongContentTitle: Story = {
  args: {
    ...Publish.args,
    title:
      'Limited Edition Anniversary World Tour Heavyweight Organic Cotton Tee With Back Print And Tour Dates',
  },
};

/** Rtl: right-to-left title and status. */
export const RtlTitle: Story = {
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl' className='w-full max-w-md'>
          <Story />
        </div>
      );
    },
  ],
  args: { ...Publish.args, title: 'قميص الجولة', currentStatus: 'مسودة' },
};

/** Partial: nested inside another card, the surface drops its own chrome. */
export const PartialNested: Story = {
  args: { ...Publish.args, nested: true },
};
