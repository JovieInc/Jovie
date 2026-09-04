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
          'Centered, image-free homepage front door with a quiet abstract light field, one headline, one support line, and the name search as the only conversion control.',
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
  },
};
