import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepageEditorialHero } from './HomepageEditorialHero';

const BACKDROP = {
  desktopSrc: '/images/hero/night-desk.webp',
  desktopWidth: 1536,
  desktopHeight: 1024,
  mobileSrc: '/images/hero/night-desk-mobile.webp',
  mobileWidth: 737,
  mobileHeight: 1024,
} as const;

const meta = {
  title: 'Marketing/HomepageEditorialHero',
  component: HomepageEditorialHero,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Full-viewport editorial hero for the homepage front door: one art-directed photo backdrop, one headline, one support line, and the name search as the only conversion control.',
      },
    },
  },
} satisfies Meta<typeof HomepageEditorialHero>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    headingId: 'homepage-editorial-hero-heading',
    headline: 'Control how the world sees you.',
    support: 'Find what the internet knows. Turn it into relationships.',
    search: { placeholder: 'Search your name', action: 'Find me' },
    backdrop: BACKDROP,
  },
};
