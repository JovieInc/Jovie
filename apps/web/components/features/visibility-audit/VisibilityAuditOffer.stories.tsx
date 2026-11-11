import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { VisibilityAuditOffer } from './VisibilityAuditOffer';

const meta = {
  title: 'Marketing/VisibilityAuditOffer',
  component: VisibilityAuditOffer,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Default-off visibility audit offer rendered inside the pricing plans section. Renders nothing until the API reports a visible offer.',
      },
    },
  },
} satisfies Meta<typeof VisibilityAuditOffer>;

export default meta;

type Story = StoryObj<typeof VisibilityAuditOffer>;

export const Hidden: Story = {
  args: {
    loadOffer: async () => null,
  },
};

export const Visible: Story = {
  args: {
    loadOffer: async () => ({
      visible: true,
      href: 'https://buy.stripe.com/test_a1b2c3',
      priceUsd: 199,
      label: 'Digital Footprint & Visibility Audit — $199',
      detail:
        'This $199 audit is credited toward the first month of Artist Presence ($199/mo).',
    }),
  },
};

/**
 * Error: the offer request failed. The offer is optional upsell, so a failure
 * renders nothing rather than an error block inside the pricing section.
 */
export const ErrorLoadFailed: Story = {
  args: {
    loadOffer: () => Promise.reject(new Error('Offer request failed')),
  },
};

/** Offline: the request never reached the API; the offer stays hidden. */
export const OfflineNetworkFailure: Story = {
  args: {
    loadOffer: () => Promise.reject(new TypeError('Failed to fetch')),
  },
};

/** Long content: the longest label and detail wrapped in a phone-width column. */
export const LongContentNarrowColumn: Story = {
  args: {
    loadOffer: async () => ({
      visible: true,
      href: 'https://buy.stripe.com/test_a1b2c3',
      priceUsd: 199,
      label:
        'Digital Footprint & Visibility Audit for Artists, Labels and Managers — $199',
      detail:
        'This $199 audit reviews every public profile, release page and listing that carries your name, and is credited toward the first month of Artist Presence ($199/mo) when you upgrade within thirty days.',
    }),
  },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
};

/** Right-to-left: Arabic offer copy in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    loadOffer: async () => ({
      visible: true,
      href: 'https://buy.stripe.com/test_a1b2c3',
      priceUsd: 199,
      label: 'تدقيق الحضور الرقمي — 199 دولارًا',
      detail: 'يُخصم هذا التدقيق من الشهر الأول في Artist Presence.',
    }),
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
