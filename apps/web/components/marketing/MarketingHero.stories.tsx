import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingHero } from './MarketingHero';

const meta: Meta<typeof MarketingHero> = {
  title: 'Marketing/MarketingHero',
  component: MarketingHero,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof MarketingHero>;

const MediaPlaceholder = () => (
  <div className='flex aspect-square w-full max-w-md items-center justify-center rounded-3xl border border-subtle bg-surface-1'>
    <p className='text-sm text-tertiary-token'>Media slot</p>
  </div>
);

/** Content mode — the canonical content-driven landing hero. */
export const Content: Story = {
  render: () => (
    <MarketingHero
      headline='Drop more music, with less work.'
      subtitle='The AI workspace for artists to plan releases, create assets, pitch playlists, and promote every drop.'
      primaryCta={{ label: 'Claim my workspace', href: '/start' }}
      secondaryCta={{ label: 'See pricing', href: '/pricing' }}
    />
  ),
};

/** Content mode with a media column (split layout). */
export const ContentSplit: Story = {
  render: () => (
    <MarketingHero
      headline='Drop more music, with less work.'
      subtitle='The AI workspace for artists to plan releases, create assets, pitch playlists, and promote every drop.'
      primaryCta={{ label: 'Claim my workspace', href: '/start' }}
      secondaryCta={{ label: 'See pricing', href: '/pricing' }}
      media={<MediaPlaceholder />}
    />
  ),
};

/** Shell mode — layout primitive for content-heavy page heroes. */
export const ShellLeft: Story = {
  render: () => (
    <MarketingHero variant='left'>
      <p className='text-sm font-medium text-tertiary-token'>Support</p>
      <h1 className='mt-6 text-4xl font-semibold tracking-tight text-balance text-primary-token sm:text-5xl lg:text-6xl'>
        We&apos;re Here To Help.
      </h1>
      <p className='mt-6 max-w-xl text-lg leading-relaxed text-secondary-token'>
        Browse our docs or reach out to our team.
      </p>
    </MarketingHero>
  ),
};

export const ShellCentered: Story = {
  render: () => (
    <MarketingHero variant='centered'>
      <h1 className='text-4xl font-semibold tracking-tight text-primary-token sm:text-5xl'>
        Centered Page Hero
      </h1>
      <p className='mt-6 max-w-xl text-lg leading-relaxed text-secondary-token'>
        Single column, text centered, constrained to page width.
      </p>
    </MarketingHero>
  ),
};

export const ShellSplit: Story = {
  render: () => (
    <MarketingHero variant='split'>
      <div>
        <h1 className='text-4xl font-semibold tracking-tight text-primary-token sm:text-5xl'>
          Split Page Hero
        </h1>
        <p className='mt-6 max-w-xl text-lg leading-relaxed text-secondary-token'>
          Two-column grid on md+, text left and media right.
        </p>
      </div>
      <MediaPlaceholder />
    </MarketingHero>
  ),
};

/** Landing mode — feature-landing hero over the Linear hero backdrop. */
export const Landing: Story = {
  render: () => (
    <MarketingHero
      eyebrow='Voice Cloning'
      title={
        <>
          Clone your voice.
          <br className='hidden sm:block' /> From any YouTube video.
        </>
      }
      body='Paste a clip. We train a model that sounds exactly like you. Full consent. Full control.'
      media={<MediaPlaceholder />}
      headingId='story-hero-heading'
      primaryCtaLabel='Start voice cloning'
      primaryCtaHref='/start'
      secondaryCtaLabel='See pricing'
      secondaryCtaHref='/pricing'
      subcopy='Free tier available. 2 min to first clone.'
      proofPoints={['YouTube to trained model', 'Consent logged']}
    />
  ),
};
