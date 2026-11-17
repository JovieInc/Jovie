import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingOfferSummary } from './MarketingOfferSummary';

/** Rendered states of the offer summary; the default lives in MarketingOfferSummary.stories.tsx. */
const meta = {
  title: 'Marketing/MarketingOfferSummary States',
  component: MarketingOfferSummary,
  parameters: { layout: 'centered' },
  args: {
    plan: 'free',
    includedLabel: 'Included free',
    included: [
      { label: 'Unlimited smart links', entitlement: 'Unlimited smart links' },
    ],
  },
  decorators: [
    Story => (
      <div className='w-96 max-w-full'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MarketingOfferSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a plan summary with no inclusion rows yet. */
export const EmptyInclusions: Story = {
  args: { plan: 'pro', includedLabel: 'Included in Pro', included: [] },
};

/** Partial: one inclusion and the terms note hidden (the page links to pricing). */
export const PartialNoTerms: Story = {
  args: { showTerms: false },
};

/** Long content: long inclusion labels that must wrap inside the card. */
export const LongContentInclusions: Story = {
  args: {
    plan: 'pro',
    includedLabel: 'Everything included in the Pro plan for working artists',
    included: [
      {
        label:
          'A public artist profile at jov.ie/you that adapts to every release, show and listener without a second tool',
        entitlement: 'Public Jovie profile page',
      },
      {
        label:
          'Unlimited smart links for every single, album, music video and presave you will ever put out',
        entitlement: 'Unlimited smart links',
      },
      {
        label:
          'Tour dates pulled in from Bandsintown and kept in step with every announced show',
        entitlement: 'Tour dates (Bandsintown)',
      },
    ],
  },
};

/** Right-to-left: Arabic inclusion copy in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    includedLabel: 'مشمول مجانًا',
    included: [
      { label: 'روابط ذكية غير محدودة', entitlement: 'Unlimited smart links' },
      {
        label: 'مواعيد الجولات من Bandsintown',
        entitlement: 'Tour dates (Bandsintown)',
      },
    ],
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
