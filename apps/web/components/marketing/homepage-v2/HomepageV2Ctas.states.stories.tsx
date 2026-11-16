import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HOMEPAGE_V2_COPY } from '@/data/homepageV2Copy';
import { HomepageStoryHeader, HomepageV2FinalCta } from './HomepageV2Ctas';

const meta = {
  title: 'Marketing/Homepage V2/HomepageV2Ctas States',
  component: HomepageV2FinalCta,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof HomepageV2FinalCta>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: a left-aligned story header with no body copy. */
export const PartialHeaderWithoutBody: StoryObj<typeof HomepageStoryHeader> = {
  render: () => (
    <HomepageStoryHeader
      align='left'
      headline={HOMEPAGE_V2_COPY.pricing.headline}
    />
  ),
};

/** Long content: a final CTA headline past the two-line clamp. */
export const LongContentFinalCta: Story = {
  args: {
    headline:
      'Keep your work moving, from the first demo to the release-day page and every playlist pitch after it.',
    ctaLabel: 'Claim your artist profile today',
  },
};

/** Long content: a long story header and body copy. */
export const LongContentStoryHeader: StoryObj<typeof HomepageStoryHeader> = {
  render: () => (
    <HomepageStoryHeader
      headline='Free to start, with every profile, release page and fan list included before you ever upgrade.'
      body={`${HOMEPAGE_V2_COPY.pricing.body} ${HOMEPAGE_V2_COPY.pricing.supportLine}`}
    />
  ),
};

/** Right-to-left: an Arabic final CTA in an Arabic document. */
export const RtlArabicFinalCta: Story = {
  args: {
    headline: 'واصل عملك.',
    ctaLabel: 'ابدأ الآن',
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
