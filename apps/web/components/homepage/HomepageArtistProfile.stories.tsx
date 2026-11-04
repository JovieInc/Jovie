import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  HomepageArtistHero,
  HomepageClose,
  HomepageLoop,
  HomepageOffer,
  HomepageOwnership,
} from './HomepageArtistProfile';

const meta = {
  title: 'Marketing/HomepageArtistProfile',
  component: HomepageArtistHero,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'General discovery, a profile preview, relationships, and one role-based waitlist. Product evidence reuses registered captures.',
      },
    },
  },
} satisfies Meta<typeof HomepageArtistHero>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Hero: Story = {};

export const Loop: Story = {
  render: () => <HomepageLoop />,
};

export const Ownership: Story = {
  render: () => <HomepageOwnership />,
};

export const Offer: Story = {
  render: () => <HomepageOffer />,
};

export const Close: Story = {
  render: () => <HomepageClose />,
};

export const FullPage: Story = {
  render: () => (
    <>
      <HomepageArtistHero />
      <HomepageLoop />
      <HomepageOwnership />
      <HomepageClose />
    </>
  ),
};
