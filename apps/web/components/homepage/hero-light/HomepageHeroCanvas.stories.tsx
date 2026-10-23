import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HOMEPAGE_COPY } from '@/data/homepageCopy';
import { HomepageHeroCanvas } from './HomepageHeroCanvas';

const hero = HOMEPAGE_COPY.hero;

const meta = {
  title: 'Marketing/HomepageHeroCanvas',
  component: HomepageHeroCanvas,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Shipped homepage hero. The CSS poster is the layout. WebGL crossfades in when the device can run it, and context loss leaves the poster in place.',
      },
    },
  },
  args: {
    headingId: 'home-hero-heading',
    headline: hero.headline,
    subhead: hero.subhead,
    claim: hero.claim,
    supportNote: hero.supportNote,
    profile: hero.profile,
    sectionOwner: 'apps/web/components/homepage/HomepageArtistProfile.tsx',
  },
  decorators: [
    Story => (
      <div className='dark min-h-svh bg-base text-primary-token'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HomepageHeroCanvas>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Canvas: Story = {};
