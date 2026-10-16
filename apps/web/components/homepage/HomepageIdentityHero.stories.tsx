import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomepageIdentityHero } from './HomepageIdentityHero';

const meta = {
  title: 'Marketing/HomepageIdentityHero',
  component: HomepageIdentityHero,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Existing split-claim hero with its technical texture, generic jov.ie/you artist-profile identity and the real handle-claim form. The identity does not depict a claimed customer or advertise a paid benefit. Existing motion and reduced-motion behavior are preserved.',
      },
    },
  },
} satisfies Meta<typeof HomepageIdentityHero>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    headingId: 'homepage-identity-hero-heading',
  },
};
