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
          'The homepage in five beats: the link, the loop (open, subscribe, release email), the list you own, the offer from offer truth, and the close. Every visual is a registry product shot.',
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
      <HomepageOffer />
      <HomepageClose />
    </>
  ),
};
