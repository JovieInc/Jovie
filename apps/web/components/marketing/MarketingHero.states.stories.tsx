import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingHero } from './MarketingHero';

/**
 * Rendered states of the shared hero. These make no Pen claim; the
 * source-backed Pen default lives in MarketingHero.stories.tsx.
 */
const meta = {
  title: 'Marketing/Sections/MarketingHero/States',
  component: MarketingHero,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof MarketingHero>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a landing hero with no proof points, subcopy or media to show. */
export const EmptyProofPoints: Story = {
  args: {
    eyebrow: 'Releases',
    headingId: 'hero-empty-proof-heading',
    title: 'Every release, ready on day one.',
    body: 'Each release gets its own page with listen links for every service.',
    media: null,
    proofPoints: [],
  },
};

/** Partial: a content hero with only its primary action and no proof row. */
export const PartialPrimaryActionOnly: Story = {
  args: {
    headingId: 'hero-partial-heading',
    headline: 'Drop more music, with less work.',
    subtitle: 'Plan releases and promote every drop from one workspace.',
    primaryCta: { label: 'Claim my workspace', href: '/start' },
    logos: false,
  },
};

/** Long content: a headline past the two-line clamp and a long subtitle. */
export const LongContentClampedHeadline: Story = {
  args: {
    headingId: 'hero-long-heading',
    headline:
      'Drop more music with less work, from the first demo to the release-day page and every playlist pitch after it',
    subtitle:
      'The AI workspace for artists to plan releases, create assets, pitch playlists, promote every drop and keep every profile, page and link in step with the catalog, without a second tool.',
    primaryCta: { label: 'Claim my workspace', href: '/start' },
    secondaryCta: { label: 'See pricing and every plan', href: '/pricing' },
  },
};

/** Long content in landing mode, with every optional row present. */
export const LongContentLandingProof: Story = {
  args: {
    eyebrow: 'Voice',
    headingId: 'hero-long-landing-heading',
    title: 'Talk through a release and watch the plan write itself.',
    body: 'Describe the drop out loud. Jovie turns it into a dated plan, the assets it needs and the pitches to send, then keeps all of it in step as dates move.',
    media: null,
    headlineMaxLines: 'none',
    secondaryCtaLabel: 'See pricing',
    secondaryCtaHref: '/pricing',
    subcopy: 'No credit card required to start.',
    proofPoints: [
      'Release plans in minutes',
      'Pitch-ready assets',
      'Every service, one link',
      'Works with your existing distributor',
    ],
  },
};

/** Right-to-left: Arabic hero copy in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    headingId: 'hero-rtl-heading',
    headline: 'أصدر موسيقى أكثر بجهد أقل.',
    subtitle: 'مساحة عمل للفنانين لتخطيط الإصدارات والترويج لكل إصدار.',
    primaryCta: { label: 'احجز مساحتك', href: '/start' },
    secondaryCta: { label: 'الأسعار', href: '/pricing' },
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
