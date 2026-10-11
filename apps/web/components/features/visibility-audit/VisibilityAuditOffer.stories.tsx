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
        'This $199 audit is credited toward the first month of Artist Visibility Pro ($199/mo).',
    }),
  },
};
