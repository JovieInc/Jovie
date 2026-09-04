import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileOutcomeDuo } from './ArtistProfileOutcomeDuo';

const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileOutcomeDuo',
  component: ArtistProfileOutcomeDuo,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <div className='bg-base text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    headline: ARTIST_PROFILE_COPY.outcomeDuo.marketingHeadline,
    duo: ARTIST_PROFILE_COPY.outcomeDuo,
  },
} satisfies Meta<typeof ArtistProfileOutcomeDuo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Marketing: Story = {
  args: {
    headline: ARTIST_PROFILE_COPY.outcomeDuo.marketingHeadline,
    duo: ARTIST_PROFILE_COPY.outcomeDuo,
  },
};

export const Homepage: Story = {
  args: {
    headline: ARTIST_PROFILE_COPY.outcomeDuo.homepageHeadline,
    duo: ARTIST_PROFILE_COPY.outcomeDuo,
  },
};
