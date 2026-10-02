import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileSectionShell',
  component: ArtistProfileSectionShell,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    width: 'page',
    children: (
      <ArtistProfileSectionHeader
        align='left'
        headline={ARTIST_PROFILE_COPY.outcomes.headline}
        body={ARTIST_PROFILE_COPY.outcomes.body}
      />
    ),
  },
} satisfies Meta<typeof ArtistProfileSectionShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Page: Story = {};

export const Landing: Story = {
  args: {
    width: 'landing',
  },
};
