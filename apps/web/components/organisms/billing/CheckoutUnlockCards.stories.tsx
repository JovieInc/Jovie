import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CheckoutUnlockCards } from './CheckoutUnlockCards';

const meta = {
  title: 'Organisms/Billing/CheckoutUnlockCards',
  component: CheckoutUnlockCards,
  parameters: { layout: 'padded' },
  args: {
    shareUrl: 'https://jov.ie/artist',
    showFanListExport: true,
    canNativeShare: true,
    onNativeShare: () => undefined,
  },
} satisfies Meta<typeof CheckoutUnlockCards>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LivePage: Story = {};

export const PrivatePageNoShareLink: Story = {
  args: { shareUrl: null },
};

export const NoNativeShare: Story = {
  args: { canNativeShare: false },
};

/** Empty: a private, unclaimed page after checkout shows neither card. */
export const EmptyPrivateUnclaimed: Story = {
  args: { shareUrl: null, showFanListExport: false },
};

/** Locked: without a claimed profile the fan-list export stays hidden. */
export const LockedFanListUnclaimed: Story = {
  args: { showFanListExport: false },
};

/** Long content: a long page URL truncates inside the copy row. */
export const LongShareUrl: Story = {
  args: {
    shareUrl:
      'https://jov.ie/theextraordinarymidnightradioorchestraandfriendsliveinlosangeles',
  },
};

/** RTL: both cards align their copy to the reading start. */
export const RtlLivePage: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
