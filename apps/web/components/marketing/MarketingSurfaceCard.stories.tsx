import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { MarketingSurfaceCard } from './MarketingSurfaceCard';

// Real homepage hero image, matching HomeHeroSurfaceCluster.tsx's
// HeroProfilePanel.
const HERO_PROFILE_IMAGE = getMarketingExportImage(
  'tim-white-profile-live-mobile'
);

const meta = {
  title: 'Marketing/MarketingSurfaceCard',
  component: MarketingSurfaceCard,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof MarketingSurfaceCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PhoneInset: Story = {
  args: {
    src: HERO_PROFILE_IMAGE.publicUrl,
    alt: 'Mobile artist profile showing Tim White identity and fan CTA',
    aspectRatio: '9 / 16',
    objectPosition: 'center top',
    variant: 'phone-inset',
    chrome: 'framed',
    glowTone: 'violet',
    imageSizes: '256px',
    className: 'w-64',
  },
};

// Real /artist-profiles release-cycle chrome labels.
export const LabeledPanel: Story = {
  args: {
    variant: 'panel',
    chrome: 'framed',
    glowTone: 'blue',
    label: 'Before The Drop',
    stateLabel: 'Release Alerts',
    className: 'h-40 w-72',
  },
};
