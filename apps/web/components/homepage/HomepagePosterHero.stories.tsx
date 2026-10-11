import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingElectricSeam } from '@/components/marketing/MarketingElectricSeam';
import { HomepagePosterHero } from './HomepagePosterHero';

/**
 * `HomepagePosterHero` re-exports `MarketingPosterHero` under the import
 * path `ArtistProfileHero` and the style-guard test assert on. Covered here
 * so the catch-all root's `homepage/` alias has its own story, separate
 * from `Marketing/Sections/MarketingPosterHero`.
 */
const meta = {
  title: 'Marketing/HomepagePosterHero',
  component: HomepagePosterHero,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof HomepagePosterHero>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    headline: 'Your music. Still moving.',
    subtitle: 'One focused workspace for every release.',
    lede: 'Keep your profile, links, and audience signals working together.',
    primaryCta: { label: 'Get started', href: '/signup' },
    secondaryCta: { label: 'See artist profiles', href: '/artist-profiles' },
    seam: <MarketingElectricSeam idSeed='storybook-homepage-poster-seam' />,
    media: (
      <div className='mx-auto min-h-72 w-full max-w-4xl rounded-t-2xl border border-subtle bg-surface-1 p-8 text-secondary-token'>
        Credible product surface
      </div>
    ),
  },
};
