import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingElectricSeam } from './MarketingElectricSeam';
import { MarketingPosterHero } from './MarketingPosterHero';

/** Rendered states of the poster hero; the defaults live in MarketingPosterHero.stories.tsx. */
const meta: Meta<typeof MarketingPosterHero> = {
  title: 'Marketing/Sections/MarketingPosterHero States',
  component: MarketingPosterHero,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof meta>;

const MEDIA = (
  <div className='mx-auto min-h-72 w-full max-w-4xl rounded-t-2xl border border-subtle bg-surface-1 p-8 text-secondary-token'>
    Credible product surface
  </div>
);

/** Partial: one primary action, no lede and no secondary action. */
export const PartialPrimaryOnly: Story = {
  args: {
    headingId: 'poster-hero-partial-heading',
    headline: 'Your music. Still moving.',
    subtitle: 'One focused workspace for every release.',
    primaryCta: { label: 'Get started', href: '/start' },
    seam: <MarketingElectricSeam idSeed='poster-hero-partial-seam' />,
    media: MEDIA,
  },
};

/** Long content: a headline past the two-line clamp with a long subtitle and lede. */
export const LongContentCopy: Story = {
  args: {
    headingId: 'poster-hero-long-heading',
    headline:
      'A deliberately long marketing headline that must keep every word available to assistive technology while never painting more than two visual lines',
    subtitle:
      'One focused workspace for every release, every profile, every link and every fan signal, without a second tool to keep in step.',
    lede: 'Keep your profile, links, presaves, tour dates and audience signals working together from the first demo to release day and every week after it.',
    primaryCta: { label: 'Get started with your workspace', href: '/start' },
    secondaryCta: {
      label: 'See every artist profile we have shipped',
      href: '/artist-profiles',
    },
    seam: <MarketingElectricSeam idSeed='poster-hero-long-seam' />,
    media: MEDIA,
  },
};

/** Right-to-left: Arabic hero copy in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    headingId: 'poster-hero-rtl-heading',
    headline: 'موسيقاك. لا تزال تتحرك.',
    subtitle: 'مساحة عمل واحدة لكل إصدار.',
    primaryCta: { label: 'ابدأ الآن', href: '/start' },
    secondaryCta: { label: 'الأسعار', href: '/pricing' },
    seam: <MarketingElectricSeam idSeed='poster-hero-rtl-seam' />,
    media: MEDIA,
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
