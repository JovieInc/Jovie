import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HOMEPAGE_COPY } from '@/data/homepageCopy';
import { HomepageHeroLight } from './HomepageHeroLight';

const meta = {
  title: 'Marketing/HomepageHeroLight',
  component: HomepageHeroLight,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Homepage hero light. The CSS poster is always there. WebGL upgrades it after idle when the device can run it, and drops back to the poster on reduced motion or context loss.',
      },
    },
  },
  decorators: [
    Story => (
      <div className='dark relative min-h-svh overflow-hidden bg-base text-primary-token'>
        <Story />
        <div className='homepage-hero-light-stage__copy mx-auto flex min-h-svh max-w-3xl flex-col justify-center px-6'>
          <h1 className='marketing-type-display'>
            {HOMEPAGE_COPY.hero.headline}
          </h1>
          <p className='marketing-type-lede text-secondary-token'>
            {HOMEPAGE_COPY.hero.subhead}
          </p>
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof HomepageHeroLight>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Poster: Story = {};
