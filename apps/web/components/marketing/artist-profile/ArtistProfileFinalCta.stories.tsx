import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ArtistProfileFinalCta } from './ArtistProfileFinalCta';

const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileFinalCta',
  component: ArtistProfileFinalCta,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    finalCta: ARTIST_PROFILE_COPY.finalCta,
  },
} satisfies Meta<typeof ArtistProfileFinalCta>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FinalCta: Story = {};
