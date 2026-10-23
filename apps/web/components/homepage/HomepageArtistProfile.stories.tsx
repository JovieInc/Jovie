import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  HomepageArtistHero,
  HomepageFanStates,
  HomepageOfferClose,
} from './HomepageArtistProfile';

const meta = {
  title: 'Marketing/HomepageArtistProfile',
  component: HomepageArtistHero,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The artist-profile homepage (EVENT 2026-10-20): the claim with the live profile, three real profile states, then the free offer from offer truth and the same claim.',
      },
    },
  },
} satisfies Meta<typeof HomepageArtistHero>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Hero: Story = {};

export const FanStates: Story = {
  render: () => <HomepageFanStates />,
};

export const OfferClose: Story = {
  render: () => <HomepageOfferClose />,
};

export const FullPage: Story = {
  render: () => (
    <>
      <HomepageArtistHero />
      <HomepageFanStates />
      <HomepageOfferClose />
    </>
  ),
};
