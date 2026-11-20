import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { marketingCenteredParameters } from '@/components/marketing/storybook/marketingStoryMeta';
import { MarketingFooterCta } from './MarketingFooterCta';

const meta = {
  title: 'Site/MarketingFooterCta',
  component: MarketingFooterCta,
  parameters: {
    ...marketingCenteredParameters,
    docs: {
      description: {
        component:
          'Adjacent component coverage for the canonical shell.footer-cta story. Copy and decoration stay owned by the production CTA wrapper.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof MarketingFooterCta>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const BinaryDownload: Story = {
  args: {
    ctaLabel: 'Download for Mac',
    ctaHref: '/api/desktop/download',
    ctaAnalyticsEvent: 'download_mac_dmg',
    ctaAnalyticsSource: 'storybook-footer-cta',
    prefetch: false,
  },
};

// The changelog terminal CTA anchors into the homepage invitation form
// (signup is invite-only). Keep this story in lockstep with that id: the
// homepage contract guard fails if any /#fragment anchor stops resolving on '/'.
export const ChangelogClaimAnchor: Story = {
  args: {
    ctaLabel: 'Request an Invite',
    ctaHref: '/#request-invite',
  },
};

/**
 * Long content: a page can override the closing label. A long one must stay
 * one centred link that wraps inside the page column.
 */
export const LongContentLabel: Story = {
  args: {
    ctaLabel:
      'Request an invite and set up your page before the next wave of access opens',
    ctaHref: '/#request-invite',
  },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole('link', {
      name: /Request an invite and set up your page/,
    });
    await userEvent.tab();
    await expect(link).toHaveFocus();
  },
};

/** Right-to-left: an Arabic closing label inside an RTL document. */
export const RtlArabicLabel: Story = {
  args: {
    ctaLabel: 'اطلب دعوة',
    ctaHref: '/#request-invite',
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('link', { name: 'اطلب دعوة' })
    ).toHaveAttribute('href', '/#request-invite');
  },
};
