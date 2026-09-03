import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { marketingCenteredParameters } from '@/components/marketing/storybook/marketingStoryMeta';
import { MarketingFinalCTA } from './MarketingFinalCTA';

const meta = {
  title: 'Site/MarketingFinalCTA',
  component: MarketingFinalCTA,
  parameters: {
    ...marketingCenteredParameters,
    docs: {
      description: {
        component:
          'Adjacent component coverage for the canonical shell.final-cta story. The shared MarketingTerminalCta owns the rendered CTA contract.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof MarketingFinalCTA>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Request private launch access.',
    body: 'One adaptive profile for every drop.',
    ctaLabel: 'Request Access',
    ctaHref: '/signup',
  },
};

export const WithSecondaryAction: Story = {
  args: {
    title: 'Keep your next release moving.',
    body: 'One adaptive profile for every drop.',
    ctaLabel: 'Request Access',
    ctaHref: '/signup',
    secondaryLabel: 'See pricing',
    secondaryHref: '/pricing',
  },
};
