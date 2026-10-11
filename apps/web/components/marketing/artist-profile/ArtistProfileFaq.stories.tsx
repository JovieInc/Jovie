import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileFaq } from './ArtistProfileFaq';

const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileFaq',
  component: ArtistProfileFaq,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    faq: ARTIST_PROFILE_COPY.faq,
  },
} satisfies Meta<typeof ArtistProfileFaq>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Faq: Story = {};
