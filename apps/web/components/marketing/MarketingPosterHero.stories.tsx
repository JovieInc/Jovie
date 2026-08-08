import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingElectricSeam } from './MarketingElectricSeam';
import { MarketingPosterHero } from './MarketingPosterHero';

const meta: Meta<typeof MarketingPosterHero> = {
  title: 'Marketing/Sections/MarketingPosterHero',
  component: MarketingPosterHero,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    headline: 'Your music. Still moving.',
    subtitle: 'One focused workspace for every release.',
    lede: 'Keep your profile, links, and audience signals working together.',
    primaryCta: { label: 'Get started', href: '/signup' },
    secondaryCta: { label: 'See artist profiles', href: '/artist-profiles' },
    seam: <MarketingElectricSeam idSeed='storybook-poster-seam' />,
    media: (
      <div className='mx-auto min-h-72 w-full max-w-4xl rounded-t-2xl border border-subtle bg-surface-1 p-8 text-secondary-token'>
        Credible product surface
      </div>
    ),
  },
};
