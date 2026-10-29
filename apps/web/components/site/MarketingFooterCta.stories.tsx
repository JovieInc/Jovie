import type { Meta, StoryObj } from '@storybook/nextjs-vite';
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

// The changelog terminal CTA anchors into the homepage hero claim input
// (JOV-8798). Keep this story in lockstep with that id: the homepage
// contract guard fails if any /#fragment anchor stops resolving on '/'.
export const ChangelogClaimAnchor: Story = {
  args: {
    ctaLabel: 'Find your profile',
    ctaHref: '/#homepage-claim-handle',
  },
};
