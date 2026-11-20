import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { APP_ROUTES } from '@/constants/routes';
import type { ProfileMonetizationSummaryResponse } from '@/lib/profile-monetization';
import { ProfilePaySurface } from './ProfilePaySurface';

const baseSummary: ProfileMonetizationSummaryResponse = {
  paymentState: 'ready_no_activity',
  provider: 'stripe',
  manageHref: APP_ROUTES.SETTINGS_PAYMENTS,
  tipUrl: 'https://jov.ie/tim/pay',
  tipVisits: 0,
  tipsReceived: 0,
  totalReceivedCents: 0,
  monthReceivedCents: 0,
  narrative: 'No visits yet. Share your link or QR to start.',
};

/**
 * Rendered states of the profile pay surface. The default surfaces live in
 * ProfilePaySurface.stories.tsx.
 */
const meta = {
  title: 'Dashboard/Molecules/ProfilePaySurface/States',
  component: ProfilePaySurface,
  parameters: { layout: 'padded' },
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

/** Empty: payments are live but no fan has opened the link, so no Analytics link. */
export const EmptyNoActivity: Story = {};

/** Partial: Stripe is connected but payouts are not live, so no link or QR yet. */
export const PartialSetupIncomplete: Story = {
  args: {
    summary: {
      ...baseSummary,
      paymentState: 'setup_incomplete',
      tipUrl: null,
      narrative: 'Connected, payouts are not live yet.',
    },
  },
};

/** Long content: a long narrative in the narrow drawer layout. */
export const LongContentNarrative: Story = {
  args: {
    variant: 'drawer',
    summary: {
      ...baseSummary,
      paymentState: 'active',
      provider: 'venmo',
      tipVisits: 12_480,
      tipsReceived: 1_204,
      totalReceivedCents: 9_876_500,
      narrative:
        '1,204 fans paid you $98,765.00 total across every release, show and merch drop this year, and your pay link keeps climbing in the share sheet.',
    },
  },
};

/** Right-to-left: an Arabic narrative in an RTL document. */
export const RtlArabicNarrative: Story = {
  args: {
    summary: {
      ...baseSummary,
      paymentState: 'traffic_no_tips',
      tipVisits: 8,
      narrative: 'فتح ٨ معجبين رابط الدفع الخاص بك. لا توجد مدفوعات بعد.',
    },
  },
  render: function RtlArabicNarrativeStory(args) {
    return (
      <div dir='rtl' lang='ar'>
        <ProfilePaySurface {...args} />
      </div>
    );
  },
};
