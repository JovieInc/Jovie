import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingHero, type MarketingHeroContentProps } from './MarketingHero';

export const MARKETING_HERO_SOURCE_SHA =
  'e21d2e01bc80d7e0146a071207c406e1cd762bd3';

/**
 * The checked-in canonical default from `lib/sections/variants/hero.tsx`.
 * This fixture proves the shared component body only; registry variant-to-route
 * bindings remain owned by the marketing composition stack.
 */
export const MARKETING_HERO_DEFAULT_PROPS = {
  headingId: 'marketing-hero-default-heading',
  headline: 'Drop more music, with less work.',
  subtitle:
    'The AI workspace for artists to plan releases, create assets, pitch playlists, and promote every drop.',
  primaryCta: { label: 'Claim my workspace', href: '/start' },
  secondaryCta: { label: 'See pricing', href: '/pricing' },
} satisfies MarketingHeroContentProps;

const meta = {
  title: 'Marketing/Sections/MarketingHero',
  component: MarketingHero,
  parameters: {
    layout: 'fullscreen',
    pen: {
      identity: 'section.hero/SijpA',
      registryId: 'section.hero',
      penNodeId: 'SijpA',
      sourcePath: 'apps/web/components/marketing/MarketingHero.tsx',
      sourceExport: 'MarketingHero',
      sourceSha: MARKETING_HERO_SOURCE_SHA,
      proofScope: 'source-backed-default-only',
      outstanding:
        'Active variant-to-route mapping remains owner-stacked and is not proven by this story.',
    },
    docs: {
      description: {
        component:
          'Exact source-backed MarketingHero default body for section.hero/SijpA. This does not claim active variant-to-route parity.',
      },
    },
  },
} satisfies Meta<typeof MarketingHero>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SourceBackedDefault: Story = {
  name: 'source-backed default',
  args: MARKETING_HERO_DEFAULT_PROPS,
};
