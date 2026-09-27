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
          'Canonical Pen homepage hero: the blue technical texture (hero only, 20s CSS drift, still under reduced motion), one headline, one support line, Request access while gated or name search when open, and the illustrative Avery Chen Jovie profile specimen.',
      },
    },
  },
} satisfies Meta<typeof HomepageEditorialHero>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    headingId: 'homepage-editorial-hero-heading',
  },
};
