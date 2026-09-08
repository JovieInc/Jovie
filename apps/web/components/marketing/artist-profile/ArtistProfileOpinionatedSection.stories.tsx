import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileOpinionatedSection } from './ArtistProfileOpinionatedSection';

const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileOpinionatedSection',
  component: ArtistProfileOpinionatedSection,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    opinionated: ARTIST_PROFILE_COPY.opinionated,
  },
} satisfies Meta<typeof ArtistProfileOpinionatedSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Section: Story = {
  args: {
    opinionated: ARTIST_PROFILE_COPY.opinionated,
  },
};
