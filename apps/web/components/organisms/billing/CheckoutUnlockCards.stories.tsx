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
