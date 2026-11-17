import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { marketingCenteredParameters } from '@/components/marketing/storybook/marketingStoryMeta';
import { MarketingFinalCTA } from './MarketingFinalCTA';

const meta = {
  title: 'Site/MarketingFinalCTA States',
  component: MarketingFinalCTA,
  parameters: marketingCenteredParameters,
} satisfies Meta<typeof MarketingFinalCTA>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: every optional prop omitted, so the defaults render alone. */
export const PartialDefaults: Story = {};

/** Long content: a long headline, body and both actions. */
export const LongContentWithSecondary: Story = {
  args: {
    title:
      'Keep your next release moving, from the first demo to the release-day page and every pitch after it.',
    body: 'One adaptive profile for every drop, every tour date and every fan who wants to hear what is next, on every service.',
    ctaLabel: 'Request Access',
    ctaHref: '/signup',
    secondaryLabel: 'See pricing and every plan',
    secondaryHref: '/pricing',
  },
};

/** Right-to-left: Arabic headline and actions in an Arabic document. */
export const RtlArabic: Story = {
  args: {
    title: 'اطلب الوصول المبكر.',
    body: 'ملف واحد لكل إصدار.',
    ctaLabel: 'اطلب الوصول',
    ctaHref: '/signup',
    secondaryLabel: 'الأسعار',
    secondaryHref: '/pricing',
  },
  decorators: [
    function WithArabicDocument(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
