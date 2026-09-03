import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepageEditorialHero } from './HomepageEditorialHero';

const meta = {
  title: 'Marketing/HomepageEditorialHero',
  component: HomepageEditorialHero,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Full-viewport editorial hero for the homepage front door: one quiet optical stage, one headline, one support line, and the name search as the only conversion control.',
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
    support:
      'Find what the internet knows about you, bring it together, and turn attention into lasting relationships.',
    search: { placeholder: 'Search your name', action: 'Find me' },
  },
};
