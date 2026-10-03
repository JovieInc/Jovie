import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent } from 'storybook/test';
import { MarketingElectricSeam } from './MarketingElectricSeam';
import { MarketingPosterHero } from './MarketingPosterHero';

const meta: Meta<typeof MarketingPosterHero> = {
  title: 'Marketing/Sections/MarketingPosterHero',
  component: MarketingPosterHero,
  parameters: { layout: 'fullscreen' },
  play: async ({ canvasElement, args }) => {
    for (const [id, cta] of [
      ['homepage-primary-cta', args.primaryCta],
      ['homepage-secondary-cta', args.secondaryCta],
    ] as const) {
      if (!cta) continue;
      const link = canvasElement.querySelector<HTMLAnchorElement>(
        `[data-testid="${id}"]`
      );
      if (!link) throw new Error(`The poster hero must render ${id}.`);
      await expect(link).toHaveAttribute('href', cta.href);
      if (typeof cta.label === 'string')
        await expect(link).toHaveAccessibleName(cta.label);
      link.focus();
      await expect(link).toHaveFocus();
      const clicked = fn();
      link.addEventListener(
        'click',
        event => {
          event.preventDefault();
          clicked();
        },
        { once: true }
      );
      await userEvent.click(link);
      await expect(clicked).toHaveBeenCalledOnce();
    }
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const LONG_MARKETING_H1_FIXTURE =
  'A deliberately long marketing headline that must keep every word available to assistive technology while never painting more than two visual lines at any supported viewport';

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

export const OverlongHeadline: Story = {
  args: {
    ...Default.args,
    headline: LONG_MARKETING_H1_FIXTURE,
  },
};

export const AuthEntryDestinations: Story = {
  args: {
    ...Default.args,
    primaryCta: { label: 'Get started', href: '/start' },
    secondaryCta: { label: 'Sign in', href: '/signin' },
  },
};

export const ExplicitPrefetchChoices: Story = {
  args: {
    ...Default.args,
    primaryCta: { label: 'Get started', href: '/start', prefetch: true },
    secondaryCta: { label: 'See pricing', href: '/pricing', prefetch: false },
  },
};

export const PublicDestinations: Story = {
  args: {
    ...Default.args,
    primaryCta: { label: 'See pricing', href: '/pricing' },
    secondaryCta: { label: 'Contact', href: '/support' },
  },
};
