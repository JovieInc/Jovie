import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { APP_ROUTES } from '@/constants/routes';
import type { ProfileMonetizationSummaryResponse } from '@/lib/profile-monetization';
import { ProfilePaySurface } from './ProfilePaySurface';

const baseSummary: ProfileMonetizationSummaryResponse = {
  paymentState: 'not_setup',
  provider: 'none',
  manageHref: APP_ROUTES.SETTINGS_PAYMENTS,
  tipUrl: null,
  tipVisits: 0,
  tipsReceived: 0,
  totalReceivedCents: 0,
  monthReceivedCents: 0,
  narrative: 'Set up payments to start collecting tips from fans.',
};

const meta = {
  title: 'Dashboard/Molecules/ProfilePaySurface',
  component: ProfilePaySurface,
  parameters: {
    layout: 'padded',
  },
  args: {
    summary: baseSummary,
    onSetUsername: () => {},
    onSetUpTips: () => {},
    onManagePayments: () => {},
    onViewAnalytics: () => {},
  },
} satisfies Meta<typeof ProfilePaySurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NotSetUp: Story = {};

export const Active: Story = {
  args: {
    summary: {
      ...baseSummary,
      paymentState: 'active',
      provider: 'stripe',
      tipUrl: 'https://jov.ie/tim/pay',
      tipVisits: 214,
      tipsReceived: 18,
      totalReceivedCents: 42_500,
      monthReceivedCents: 8_200,
      narrative: "You've received 18 tips totaling $425.00.",
    },
  },
};

export const DrawerVariant: Story = {
  args: {
    variant: 'drawer',
    summary: {
      ...baseSummary,
      paymentState: 'active',
      provider: 'venmo',
      tipUrl: 'https://jov.ie/tim/pay',
      tipVisits: 42,
      tipsReceived: 3,
      totalReceivedCents: 6_000,
      monthReceivedCents: 2_000,
      narrative: "You've received 3 tips totaling $60.00.",
    },
  },
};
