import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { ARTIST_PROFILE_SOCIAL_PROOF } from '@/data/socialProof';
import { ArtistProfileLogoBar } from './ArtistProfileLogoBar';

const meta = {
  title: 'Marketing/Artist Profile/ArtistProfileLogoBar',
  component: ArtistProfileLogoBar,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    proofData: ARTIST_PROFILE_SOCIAL_PROOF,
    adaptive: ARTIST_PROFILE_COPY.adaptive,
    phoneCaption: ARTIST_PROFILE_COPY.hero.phoneCaption,
    phoneSubcaption: ARTIST_PROFILE_COPY.hero.phoneSubcaption,
  },
} satisfies Meta<typeof ArtistProfileLogoBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LogoBar: Story = {};
