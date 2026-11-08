import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HOMEPAGE_FEATURED_ARTIST } from '@/data/demoArtists';
import { HomepageProfilePhone } from './HomepageProfilePhone';

/** The featured (demo) artist's profile at the canonical 310px phone (Pen WyQJb). */
const meta = {
  title: 'Marketing/HomepageProfilePhone',
  component: HomepageProfilePhone,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof HomepageProfilePhone>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FeaturedArtist: Story = {
  args: {
    alt: 'An example artist’s Jovie profile.',
    release: {
      title: HOMEPAGE_FEATURED_ARTIST.releases[0].title,
      src: HOMEPAGE_FEATURED_ARTIST.releases[0].src,
    },
  },
};
