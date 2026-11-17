import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileFaq } from './ArtistProfileFaq';

/** Rendered states of the artist-profile FAQ; the default lives in ArtistProfileFaq.stories.tsx. */
const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileFaq States',
  component: ArtistProfileFaq,
  parameters: { layout: 'fullscreen' },
  args: { faq: ARTIST_PROFILE_COPY.faq },
} satisfies Meta<typeof ArtistProfileFaq>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the FAQ heading with no questions yet. */
export const EmptyQuestions: Story = {
  args: { faq: { headline: ARTIST_PROFILE_COPY.faq.headline, items: [] } },
};
