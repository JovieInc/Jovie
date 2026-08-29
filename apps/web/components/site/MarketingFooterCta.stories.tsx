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
  args: {
    title: 'Request Access to Jovie.',
    body: 'Join the private launch list for the release platform built for independent artists.',
    ctaLabel: 'Request Access',
    ctaHref: '/signup',
  },
};

export const BinaryDownload: Story = {
  args: {
    title: 'Ready to install Jovie?',
    body: 'Download the desktop workspace for Mac.',
    ctaLabel: 'Download for Mac',
    ctaHref: '/api/desktop/download',
    ctaAnalyticsEvent: 'download_mac_dmg',
    ctaAnalyticsSource: 'storybook-footer-cta',
    prefetch: false,
  },
};
